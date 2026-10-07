from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import torch
import torch.nn as nn  # Добавлен импорт torch.nn
import pickle
import numpy as np
import pandas as pd
from io import BytesIO
import os
import sys
from cryptography.fernet import Fernet
from fastapi.middleware.cors import CORSMiddleware
import traceback
import shutil
import json
import threading
from datetime import datetime
import copy
import time
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset
from torch.optim.lr_scheduler import ReduceLROnPlateau


# --- User-data директория ---
_state_lock = threading.Lock()

def get_user_data_dir():
    """Директория для изменяемых данных. Electron передаёт через переменную окружения."""
    user_dir = os.environ.get("USER_DATA_DIR")
    if user_dir:
        os.makedirs(user_dir, exist_ok=True)
        return user_dir
    fallback = os.path.join(os.path.expanduser("~"), ".neuromodule")
    os.makedirs(fallback, exist_ok=True)
    return fallback


# --- Путь к CSV (с копированием bundled при первом запуске) ---
def get_writable_csv_path():
    """Путь к user-data версии CSV. При первом обращении копирует bundled."""
    user_path = os.path.join(get_user_data_dir(), "fire_data_test_encrypted.bin")
    if not os.path.exists(user_path):
        bundled = resource_path("fire_data_test_encrypted.bin")
        shutil.copy(bundled, user_path)
    return user_path


def get_writable_key_path():
    """Аналогично для ключа шифрования."""
    user_path = os.path.join(get_user_data_dir(), "encryption_key.key")
    if not os.path.exists(user_path):
        bundled = resource_path("encryption_key.key")
        shutil.copy(bundled, user_path)
    return user_path


def get_writable_model_path(filename: str) -> str:
    """Путь к user-data версии модели. Если нет — копирует bundled."""
    user_path = os.path.join(get_user_data_dir(), filename)
    if not os.path.exists(user_path):
        bundled = resource_path(filename)
        shutil.copy(bundled, user_path)
    return user_path


def get_active_model_path(filename: str) -> str:
    """Путь к модели для загрузки: user-data приоритет, иначе bundled."""
    user_path = os.path.join(get_user_data_dir(), filename)
    if os.path.exists(user_path):
        return user_path
    return resource_path(filename)


# --- Счётчик строк в CSV ---
def _count_csv_rows() -> int:
    try:
        csv_path = get_writable_csv_path()
        key_path = get_writable_key_path()
        with open(key_path, "rb") as kf:
            key = kf.read()
        fernet = Fernet(key)
        with open(csv_path, "rb") as f:
            encrypted = f.read()
        decrypted = fernet.decrypt(encrypted)
        lines = decrypted.decode("utf-8").splitlines()
        return max(0, len(lines) - 1)  # минус заголовок
    except Exception as e:
        print(f"[CSV COUNT ERROR] {e}", flush=True)
        return 0


# --- Состояние дообучения ---
def _load_retrain_state():
    path = os.path.join(get_user_data_dir(), "retrain_state.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "rows_at_last_retrain": 0,
        "threshold": 50,
        "last_retrain_at": None,
        "retrain_count": 0,
    }


def _save_retrain_state(state):
    path = os.path.join(get_user_data_dir(), "retrain_state.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


# --- Добавление строки в CSV ---
COLUMN_ORDER = [
    'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
    'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
    'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
    'Количество_основных_пожарных_автомобилей_ед',
    'Количество_специальных_пожарных_автомобилей_ед',
    'Количество_пожарных_поездов_ед', 'Всего_подано_пожарных_стволов_ед',
]

def _append_row_to_csv(data: dict):
    """Добавляет строку в CSV. data — dict с ключами из COLUMN_ORDER."""
    csv_path = get_writable_csv_path()
    key_path = get_writable_key_path()
    with open(key_path, "rb") as kf:
        key = kf.read()
    fernet = Fernet(key)
    with open(csv_path, "rb") as f:
        encrypted = f.read()
    decrypted = fernet.decrypt(encrypted).decode("utf-8")

    row = [str(data.get(col, 0)) for col in COLUMN_ORDER]
    new_row = ",".join(row) + "\n"
    updated = decrypted.rstrip("\n") + "\n" + new_row

    encrypted_updated = fernet.encrypt(updated.encode("utf-8"))
    with open(csv_path, "wb") as f:
        f.write(encrypted_updated)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Итерация 8: состояние дообучения ---
_retrain_status = {
    "running": False,
    "progress": 0,
    "stage": 0,
    "total_stages": 4,
    "epoch": 0,
    "total_epochs": 0,
    "message": "Ожидание",
    "error": None,
    "last_result": None,  # {"val_loss": ..., "mae": ..., "accuracy": ..., "f1": ...}
}

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    tb = traceback.format_exc()
    print(f"[UNHANDLED] {tb}", flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Необработанная ошибка: {type(exc).__name__}: {str(exc)}\n{tb}"}
    )

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS if hasattr(sys, '_MEIPASS') else os.path.abspath(".")
        full_path = os.path.join(base_path, relative_path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Файл не найден: {full_path}")
        return full_path
    except Exception as e:
        print(f"Ошибка в resource_path для {relative_path}: {e}")
        raise

# Модель нейронной сети
class FirePredictionNN(torch.nn.Module):
    def __init__(self, input_sizes):
        super(FirePredictionNN, self).__init__()
        self.input_sizes = input_sizes
        self.layers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(input_size, 128),
                nn.BatchNorm1d(128),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(128, 64),
                nn.BatchNorm1d(64),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(64, 32),
                nn.ReLU()
            ) for input_size in input_sizes
        ])
        self.regression_heads = nn.ModuleList([
            nn.Linear(32, output_size - 1) if output_size > 1 else None
            for output_size in [5, 4, 3, 1]
        ])
        self.classification_heads = nn.ModuleList([
            nn.Linear(32, 4) for _ in range(4)
        ])

    def forward(self, x, stage):
        if x.shape[0] == 0:
            raise ValueError(f"Пустой входной тензор на этапе {stage}")
        x = self.layers[stage](x)
        reg_output = self.regression_heads[stage](x) if self.regression_heads[stage] is not None else None
        cls_output = self.classification_heads[stage](x)
        return reg_output, cls_output

# Загрузка модели и скалеров
try:
    input_sizes = [5, 6, 7, 8]
    model = FirePredictionNN(input_sizes)
    model.load_state_dict(torch.load(get_active_model_path("fire_prediction_model.pth")))
    model.eval()
    with open(get_active_model_path("scalers.pkl"), "rb") as f:
        scaler_data = pickle.load(f)
        scalers = scaler_data["scalers"]
        y_scalers = scaler_data["y_scalers"]
    print("Модель и скалеры успешно загружены")
except Exception as e:
    print(f"Ошибка загрузки модели или скалеров: {e}")
    raise


def _reload_model_and_scalers():
    """Перезагружает модель и скалеры из активных путей в глобальные переменные."""
    global model, scalers, y_scalers
    try:
        model.load_state_dict(torch.load(get_active_model_path("fire_prediction_model.pth")))
        model.eval()
        with open(get_active_model_path("scalers.pkl"), "rb") as f:
            data = pickle.load(f)
            scalers = data["scalers"]
            y_scalers = data["y_scalers"]
        print("[RETRAIN] Модель и скалеры перезагружены", flush=True)
        return True
    except Exception as e:
        print(f"[RETRAIN] Ошибка перезагрузки: {e}", flush=True)
        return False

def predict_fire_parameters(model, scalers, y_scalers, input_data, stage):
    model.eval()
    with torch.no_grad():
        input_features = {
            0: [
                'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед'
            ],
            1: [
                'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин'
            ],
            2: [
                'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин',
                'Время_ликвидации_открытого_горения_мин'
            ],
            3: [
                'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин',
                'Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин'
            ]
        }
        output_features = {
            0: [
                'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'
            ],
            1: [
                'Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'
            ],
            2: [
                'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'
            ],
            3: ['Всего_подано_пожарных_стволов_ед']
        }
        for feature in input_features[stage]:
            if feature not in input_data:
                raise ValueError(f"Отсутствует параметр: {feature}")
        X = np.array([float(input_data[feature]) for feature in input_features[stage]]).reshape(1, -1)
        if np.any(np.isnan(X)) or np.any(np.isinf(X)):
            raise ValueError("Входные данные содержат NaN или бесконечные значения")
        X = scalers[f'stage{stage+1}'].transform(X)
        X = torch.tensor(X, dtype=torch.float32)
        reg_pred, cls_pred = model(X, stage)
        reg_pred = reg_pred.numpy() if reg_pred is not None else np.array([])
        cls_pred = torch.argmax(cls_pred, dim=1).numpy()[0] + 1
        result = {}
        if stage < 3:
            for i, col in enumerate(output_features[stage][:-1]):
                val = float(y_scalers[col].inverse_transform(reg_pred[:, i:i+1])[0, 0])
                if col in ['Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
                           'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин']:
                    val = max(1.0, min(val, 60.0))
                result[col] = float(val)
        result['Всего_подано_пожарных_стволов_ед'] = int(cls_pred)
        if stage == 2:
            result['Время_тушения_мин'] = (
                input_data['Время_локализации_пожара_мин'] +
                input_data['Время_ликвидации_открытого_горения_мин']
            )
        return result

# --- Итерация 8: фоновая функция дообучения ---
def _retrain_worker():
    """
    Фоновое дообучение модели на накопленных данных.
    Работает в отдельном потоке. Обновляет _retrain_status по ходу.
    """
    global model, scalers, y_scalers

    try:
        _retrain_status.update({
            "running": True, "progress": 0, "stage": 0, "epoch": 0,
            "message": "Подготовка данных...", "error": None, "last_result": None,
        })

        # Ограничиваем нагрузку на CPU
        torch.set_num_threads(2)

        # Загружаем CSV из user-data
        csv_path = get_writable_csv_path()
        key_path = get_writable_key_path()
        with open(key_path, "rb") as kf:
            key = kf.read()
        fernet = Fernet(key)
        with open(csv_path, "rb") as f:
            encrypted = f.read()
        decrypted = fernet.decrypt(encrypted)

        column_names = [
            'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
            'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
            'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
            'Количество_основных_пожарных_автомобилей_ед',
            'Количество_специальных_пожарных_автомобилей_ед',
            'Количество_пожарных_поездов_ед', 'Всего_подано_пожарных_стволов_ед'
        ]
        df = pd.read_csv(BytesIO(decrypted), encoding='utf-8', header=None,
                         names=column_names, skiprows=1)

        _retrain_status["message"] = f"Загружено {len(df)} строк. Очистка..."

        # Чистка выбросов (как в Tkinter)
        for col in column_names:
            if col in df.columns and df[col].dtype in [np.float64, np.int64]:
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]
        df = df.dropna()

        if len(df) < 20:
            raise ValueError(f"Недостаточно данных для дообучения: {len(df)} строк")

        # Клипим число стволов до 4 классов (модель обучена на 4 выхода)
        # Значения 1, 2, 3 остаются как есть, всё что >= 4 — считается как "4+"
        df = df.copy()
        df['class_idx'] = np.clip(
            df['Всего_подано_пожарных_стволов_ед'].values - 1, 0, 3
        ).astype(int)

        class_counts_before = [int((df['class_idx'] == c).sum()) for c in range(4)]
        print(f"[RETRAIN] Распределение классов (0-3) до фильтра: {class_counts_before}", flush=True)

        valid_classes = [c for c in range(4) if class_counts_before[c] >= 2]
        df = df[df['class_idx'].isin(valid_classes)]

        if len(df) < 20:
            raise ValueError(f"После фильтрации редких классов: {len(df)} строк")

        class_counts_after = [int((df['class_idx'] == c).sum()) for c in range(4)]
        print(f"[RETRAIN] Распределение классов (0-3) после фильтра: {class_counts_after}", flush=True)

        _retrain_status["message"] = f"Обучаем на {len(df)} строках..."

        # Архитектура и фичи (как в исходном Tkinter)
        input_features = {
            0: ['Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед'],
            1: ['Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин'],
            2: ['Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин',
                'Время_ликвидации_открытого_горения_мин'],
            3: ['Время_следования_мин', 'Время_подачи_первого_ствола_мин',
                'Количество_основных_пожарных_автомобилей_ед',
                'Количество_специальных_пожарных_автомобилей_ед',
                'Количество_пожарных_поездов_ед', 'Время_локализации_пожара_мин',
                'Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин']
        }
        output_features = {
            0: ['Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'],
            1: ['Время_ликвидации_открытого_горения_мин',
                'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'],
            2: ['Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
                'Всего_подано_пожарных_стволов_ед'],
            3: ['Всего_подано_пожарных_стволов_ед']
        }

        # Копируем модель, чтобы не сломать работающую
        training_model = copy.deepcopy(model)
        new_scalers = {}
        new_y_scalers = {}
        # Веса для 4 классов (индексы 0-3). Если класс отсутствует — вес 1.0
        max_count = max(class_counts_after) if max(class_counts_after) > 0 else 1
        class_weights = torch.tensor(
            [max_count / c if c > 0 else 1.0 for c in class_counts_after],
            dtype=torch.float32
        )
        print(f"[RETRAIN] class_weights = {class_weights.tolist()}", flush=True)

        last_metrics = {}

        for stage in range(4):
            _retrain_status.update({
                "stage": stage + 1,
                "message": f"Этап {stage + 1}/4: подготовка...",
            })

            X = df[input_features[stage]].values
            if X.shape[0] < 10:
                continue

            y_cols = [c for c in output_features[stage] if c != 'Всего_подано_пожарных_стволов_ед']
            y_cls = df['class_idx'].values

            if y_cols:
                y_reg = df[y_cols].values
                X_train, X_val, y_reg_train, y_reg_val, y_cls_train, y_cls_val = train_test_split(
                    X, y_reg, y_cls, test_size=0.2, random_state=42, stratify=y_cls
                )
                y_reg_train = np.log1p(y_reg_train)
                y_reg_val = np.log1p(y_reg_val)
            else:
                y_reg_train = None
                X_train, X_val, y_cls_train, y_cls_val = train_test_split(
                    X, y_cls, test_size=0.2, random_state=42, stratify=y_cls
                )

            new_scalers[f'stage{stage+1}'] = StandardScaler()
            X_train_scaled = new_scalers[f'stage{stage+1}'].fit_transform(X_train)
            X_val_scaled = new_scalers[f'stage{stage+1}'].transform(X_val)

            for col in y_cols:
                new_y_scalers[col] = StandardScaler()
                new_y_scalers[col].fit(np.log1p(df[[col]]))

            X_train_t = torch.tensor(X_train_scaled, dtype=torch.float32)
            X_val_t = torch.tensor(X_val_scaled, dtype=torch.float32)
            y_cls_train_t = torch.tensor(y_cls_train, dtype=torch.long)
            y_cls_val_t = torch.tensor(y_cls_val, dtype=torch.long)
            y_reg_train_t = torch.tensor(y_reg_train, dtype=torch.float32) if y_reg_train is not None else None
            y_reg_val_t = torch.tensor(y_reg_val, dtype=torch.float32) if y_reg_val is not None else None

            if y_reg_train_t is not None:
                train_ds = TensorDataset(X_train_t, y_reg_train_t, y_cls_train_t)
                val_ds = TensorDataset(X_val_t, y_reg_val_t, y_cls_val_t)
            else:
                train_ds = TensorDataset(X_train_t, y_cls_train_t)
                val_ds = TensorDataset(X_val_t, y_cls_val_t)

            train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
            val_loader = DataLoader(val_ds, batch_size=64, shuffle=False)

            optimizer = torch.optim.Adam(training_model.parameters(), lr=0.0005, weight_decay=1e-4)
            scheduler = ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=3)
            mse_loss = nn.MSELoss()
            ce_loss = nn.CrossEntropyLoss(weight=class_weights)

            best_val_loss = float('inf')
            patience = 10
            patience_counter = 0
            max_epochs = 50
            _retrain_status["total_epochs"] = max_epochs

            for epoch in range(max_epochs):
                training_model.train()
                train_loss = 0.0
                for batch in train_loader:
                    optimizer.zero_grad()
                    X_b = batch[0]
                    y_reg_b = batch[1] if len(batch) > 2 else None
                    y_cls_b = batch[-1]
                    reg_pred, cls_pred = training_model(X_b, stage)
                    loss = ce_loss(cls_pred, y_cls_b)
                    if reg_pred is not None and y_reg_b is not None:
                        loss = loss + 0.5 * mse_loss(reg_pred, y_reg_b)
                    loss.backward()
                    optimizer.step()
                    train_loss += loss.item()

                # Валидация
                training_model.eval()
                val_loss = 0.0
                reg_preds_list, reg_targets_list = [], []
                cls_preds_list, cls_targets_list = [], []
                with torch.no_grad():
                    for batch in val_loader:
                        X_b = batch[0]
                        y_reg_b = batch[1] if len(batch) > 2 else None
                        y_cls_b = batch[-1]
                        reg_pred, cls_pred = training_model(X_b, stage)
                        loss = ce_loss(cls_pred, y_cls_b)
                        if reg_pred is not None and y_reg_b is not None:
                            loss = loss + 0.5 * mse_loss(reg_pred, y_reg_b)
                        val_loss += loss.item()
                        if reg_pred is not None:
                            reg_preds_list.append(reg_pred.cpu().numpy())
                            reg_targets_list.append(y_reg_b.cpu().numpy())
                        cls_preds_list.append(torch.argmax(cls_pred, dim=1).cpu().numpy())
                        cls_targets_list.append(y_cls_b.cpu().numpy())

                val_loss = val_loss / max(len(val_loader), 1)
                scheduler.step(val_loss)

                if reg_preds_list:
                    reg_preds_arr = np.concatenate(reg_preds_list)
                    reg_targets_arr = np.concatenate(reg_targets_list)
                    reg_preds_orig = np.expm1(new_y_scalers[y_cols[0]].inverse_transform(reg_preds_arr))
                    reg_targets_orig = np.expm1(new_y_scalers[y_cols[0]].inverse_transform(reg_targets_arr))
                    mae = mean_absolute_error(reg_targets_orig, reg_preds_orig)
                else:
                    mae = float('inf')
                cls_preds_arr = np.concatenate(cls_preds_list)
                cls_targets_arr = np.concatenate(cls_targets_list)
                accuracy = accuracy_score(cls_targets_arr, cls_preds_arr)
                f1 = f1_score(cls_targets_arr, cls_preds_arr, average='weighted', zero_division=0)

                _retrain_status.update({
                    "epoch": epoch + 1,
                    "progress": int(((stage * max_epochs) + (epoch + 1)) / (4 * max_epochs) * 100),
                    "message": f"Этап {stage+1}/4, эпоха {epoch+1}/{max_epochs}",
                })

                last_metrics = {
                    "val_loss": float(val_loss),
                    "mae": float(mae) if mae != float('inf') else None,
                    "accuracy": float(accuracy),
                    "f1": float(f1),
                }

                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    patience_counter = 0
                else:
                    patience_counter += 1
                    if patience_counter >= patience:
                        break

        # Сохраняем дообученную модель в user-data
        _retrain_status["message"] = "Сохранение модели..."
        torch.save(training_model.state_dict(),
                   os.path.join(get_user_data_dir(), "fire_prediction_model.pth"))
        with open(os.path.join(get_user_data_dir(), "scalers.pkl"), "wb") as f:
            pickle.dump({"scalers": new_scalers, "y_scalers": new_y_scalers}, f)

        # Обновляем in-memory модель
        model = training_model
        scalers = new_scalers
        y_scalers = new_y_scalers

        # Обновляем состояние
        state = _load_retrain_state()
        state["rows_at_last_retrain"] = _count_csv_rows()
        state["last_retrain_at"] = datetime.now().isoformat()
        state["retrain_count"] = state.get("retrain_count", 0) + 1
        _save_retrain_state(state)

        _retrain_status.update({
            "running": False,
            "progress": 100,
            "message": f"Готово. Обучено на {len(df)} строках.",
            "last_result": last_metrics,
        })
        print(f"[RETRAIN] Завершено. Метрики: {last_metrics}", flush=True)

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[RETRAIN ERROR] {tb}", flush=True)
        _retrain_status.update({
            "running": False,
            "message": f"Ошибка: {e}",
            "error": str(e),
        })
    finally:
        torch.set_num_threads(torch.get_num_threads())  # восстановить


# --- Итерация 8: эндпоинты дообучения ---

@app.post("/retrain")
async def start_retrain():
    """Запускает дообучение в фоновом потоке. Возвращает 409, если уже идёт."""
    if _retrain_status["running"]:
        raise HTTPException(status_code=409, detail="Дообучение уже выполняется")

    # Проверяем, что данных достаточно
    total = _count_csv_rows()
    state = _load_retrain_state()
    new_rows = total - state["rows_at_last_retrain"]

    if total < 20:
        raise HTTPException(status_code=400, detail=f"Недостаточно данных: {total} строк")

    thread = threading.Thread(target=_retrain_worker, daemon=True)
    thread.start()

    print(f"[RETRAIN] Запущено дообучение. Всего={total}, новых={new_rows}", flush=True)

    return {
        "status": "started",
        "total_rows": total,
        "new_rows": new_rows,
    }


@app.get("/retrain/status")
async def retrain_status():
    """Возвращает текущий статус дообучения."""
    return dict(_retrain_status)


@app.post("/retrain/set-threshold")
async def set_threshold(data: dict):
    """Меняет порог авто-дообучения."""
    try:
        new_threshold = int(data.get("threshold", 25))
        if new_threshold < 5:
            raise HTTPException(status_code=400, detail="Порог должен быть не менее 5")
        if new_threshold > 1000:
            raise HTTPException(status_code=400, detail="Порог должен быть не более 1000")

        state = _load_retrain_state()
        state["threshold"] = new_threshold
        _save_retrain_state(state)

        return {"status": "ok", "threshold": new_threshold}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrain/reset")
async def reset_model():
    """Удаляет дообученную модель из user-data и загружает базовую."""
    try:
        # Удаляем дообученные файлы
        removed = []
        for filename in ["fire_prediction_model.pth", "scalers.pkl"]:
            path = os.path.join(get_user_data_dir(), filename)
            if os.path.exists(path):
                os.remove(path)
                removed.append(filename)

        # Перезагружаем модель из bundled
        success = _reload_model_and_scalers()

        return {
            "status": "reset" if success else "error",
            "removed": removed,
            "message": "Модель сброшена к базовой" if success else "Ошибка перезагрузки",
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[RESET ERROR] {tb}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model/info")
async def model_info():
    """Информация о текущей модели: базовая или дообученная."""
    try:
        user_model_path = os.path.join(get_user_data_dir(), "fire_prediction_model.pth")
        is_user_model = os.path.exists(user_model_path)
        state = _load_retrain_state()
        return {
            "source": "user" if is_user_model else "bundled",
            "retrain_count": state.get("retrain_count", 0),
            "last_retrain_at": state.get("last_retrain_at"),
            "threshold": state.get("threshold", 25),
            "total_rows": _count_csv_rows(),
            "new_rows": _count_csv_rows() - state.get("rows_at_last_retrain", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
async def predict(data: dict):
    try:
        input_data = data.get("input_data", {})
        stage = data.get("stage", 0)
        result = predict_fire_parameters(model, scalers, y_scalers, input_data, stage)
        return result
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[PREDICT ERROR] {tb}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка предсказания: {type(e).__name__}: {str(e)}\n{tb}"
        )

@app.post("/data")
async def receive_data(data: dict):
    try:
        # Клипим число стволов до 4 (модель работает с 4 классами: 1, 2, 3, 4+)
        data_clipped = dict(data)
        raw_stvols = int(data_clipped.get('Всего_подано_пожарных_стволов_ед', 1))
        data_clipped['Всего_подано_пожарных_стволов_ед'] = min(max(raw_stvols, 1), 4)

        with _state_lock:
            _append_row_to_csv(data_clipped)
            total = _count_csv_rows()
            state = _load_retrain_state()
            new_rows = total - state["rows_at_last_retrain"]
            threshold = state["threshold"]

        auto_retrain_started = False

        # Авто-триггер дообучения (итерация 8)
        if new_rows >= threshold and not _retrain_status["running"]:
            thread = threading.Thread(target=_retrain_worker, daemon=True)
            thread.start()
            auto_retrain_started = True
            print(f"[AUTO-RETRAIN] Порог достигнут: {new_rows} >= {threshold}. Запуск.", flush=True)

        print(f"[DATA] Saved row. Total={total}, new={new_rows}/{threshold}", flush=True)

        return {
            "status": "success",
            "total_rows": total,
            "new_rows": new_rows,
            "threshold": threshold,
            "auto_retrain_started": auto_retrain_started,
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[DATA ERROR] {tb}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка сохранения: {type(e).__name__}: {str(e)}\n{tb}"
        )


@app.get("/data/status")
async def data_status():
    try:
        total = _count_csv_rows()
        state = _load_retrain_state()
        new_rows = total - state["rows_at_last_retrain"]
        return {
            "total_rows": total,
            "new_rows": new_rows,
            "threshold": state["threshold"],
            "retrain_count": state["retrain_count"],
            "last_retrain_at": state["last_retrain_at"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/median_values")
async def get_median_values(filter_params: dict):
    try:
        csv_path = resource_path("fire_data_test_encrypted.bin")
        key_path = resource_path("encryption_key.key")
        with open(key_path, "rb") as key_file:
            key = key_file.read()
        fernet = Fernet(key)
        with open(csv_path, "rb") as file:
            encrypted_data = file.read()
        decrypted_data = fernet.decrypt(encrypted_data)
        column_names = [
            'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
            'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
            'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
            'Количество_основных_пожарных_автомобилей_ед',
            'Количество_специальных_пожарных_автомобилей_ед',
            'Количество_пожарных_поездов_ед', 'Всего_подано_пожарных_стволов_ед'
        ]
        df = pd.read_csv(BytesIO(decrypted_data), encoding='utf-8', header=None,
                         names=column_names, skiprows=1)
        for param, value in filter_params.items():
            if param in df.columns and value > 0:
                df = df[df[param] == value]
        median_values = {
            param: int(df[param].median()) if not np.isnan(df[param].median()) else (
                1 if param == 'Всего_подано_пожарных_стволов_ед' else 0
            )
            for param in column_names if param in df.columns
        }
        return median_values
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения медианных значений: {str(e)}")
