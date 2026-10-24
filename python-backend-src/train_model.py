import os
import sys
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from io import BytesIO
from cryptography.fernet import Fernet

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


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
            for output_size in [10, 9, 8, 6]
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


COLUMN_ORDER = [
    'Время_следования_мин', 'Время_подачи_первого_ствола_мин',
    'Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
    'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
    'Количество_основных_пожарных_автомобилей_ед',
    'Количество_специальных_пожарных_автомобилей_ед',
    'Количество_пожарных_поездов_ед', 'Всего_подано_пожарных_стволов_ед',
    'Количество_АСО_ед', 'Количество_АСА_ед', 'Количество_людей_ед',
]

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
        'Количество_основных_пожарных_автомобилей_ед',
        'Количество_АСО_ед', 'Количество_АСА_ед', 'Количество_пожарных_поездов_ед',
        'Количество_людей_ед', 'Всего_подано_пожарных_стволов_ед'
    ],
    1: [
        'Время_ликвидации_открытого_горения_мин',
        'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
        'Количество_основных_пожарных_автомобилей_ед',
        'Количество_АСО_ед', 'Количество_АСА_ед', 'Количество_пожарных_поездов_ед',
        'Количество_людей_ед', 'Всего_подано_пожарных_стволов_ед'
    ],
    2: [
        'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин',
        'Количество_основных_пожарных_автомобилей_ед',
        'Количество_АСО_ед', 'Количество_АСА_ед', 'Количество_пожарных_поездов_ед',
        'Количество_людей_ед', 'Всего_подано_пожарных_стволов_ед'
    ],
    3: [
        'Количество_основных_пожарных_автомобилей_ед',
        'Количество_АСО_ед', 'Количество_АСА_ед', 'Количество_пожарных_поездов_ед',
        'Количество_людей_ед', 'Всего_подано_пожарных_стволов_ед'
    ]
}


def train():
    csv_path = os.path.join(BASE_DIR, "fire_data_test_encrypted.bin")
    key_path = os.path.join(BASE_DIR, "encryption_key.key")
    print(f"[TRAIN] Reading CSV: {csv_path}", flush=True)

    with open(key_path, "rb") as kf:
        key = kf.read()
    fernet = Fernet(key)

    with open(csv_path, "rb") as f:
        encrypted = f.read()
    decrypted = fernet.decrypt(encrypted)

    # Читаем БЕЗ names, чтобы Pandas показал реальное количество колонок
    df = pd.read_csv(BytesIO(decrypted), encoding="utf-8", header=None)

    # Если первая строка похожа на заголовок (содержит строки, а не числа), удаляем её
    if isinstance(df.iloc[0, 0], str) and not df.iloc[0, 0].replace('.', '', 1).isdigit():
        df = df.iloc[1:].reset_index(drop=True)

    # Принудительно конвертируем все колонки в числа (строки с ошибками → NaN)
    df = df.apply(pd.to_numeric, errors='coerce')

    actual_cols = df.shape[1]
    print(f"[TRAIN] Actual CSV columns: {actual_cols}", flush=True)

    if actual_cols == 10:
        df.columns = COLUMN_ORDER[:10]
        df['Количество_АСО_ед'] = (df.index % 13 == 0).astype(int)
        df['Количество_АСА_ед'] = (df['Количество_специальных_пожарных_автомобилей_ед'] - df['Количество_АСО_ед']).clip(lower=0)
        df['Количество_людей_ед'] = df['Всего_подано_пожарных_стволов_ед'] * 1 + df['Количество_основных_пожарных_автомобилей_ед'] * 4
        print(f"[TRAIN] Migrated 10-col CSV to 13 cols in memory", flush=True)
    elif actual_cols == 13:
        df.columns = COLUMN_ORDER
        print(f"[TRAIN] CSV already has 13 cols", flush=True)
    else:
        raise ValueError(f"Неизвестное количество колонок в CSV: {actual_cols}")

    # Подготовка
    df = df.dropna()

    # IQR-фильтр для каждой числовой колонки
    for col in df.columns:
        if df[col].dtype in [np.float64, np.int64]:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            # Если разброс нулевой (все значения одинаковые) — не фильтруем
            if IQR > 0:
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]

    df = df.dropna()

    if len(df) < 20:
        raise ValueError(f"Недостаточно данных для обучения: {len(df)} строк")

    df['class_idx'] = np.clip(
        df['Всего_подано_пожарных_стволов_ед'].values - 1, 0, 3
    ).astype(int)

    class_counts = [int((df['class_idx'] == c).sum()) for c in range(4)]
    max_count = max(class_counts) if max(class_counts) > 0 else 1
    class_weights = torch.tensor(
        [max_count / c if c > 0 else 1.0 for c in class_counts],
        dtype=torch.float32
    )
    print(f"[TRAIN] class_weights = {class_weights.tolist()}", flush=True)

    # Новая модель с нуля (не загружаем старые веса)
    training_model = FirePredictionNN([5, 6, 7, 8])
    new_scalers = {}
    new_y_scalers = {}

    mse_loss = nn.MSELoss()
    ce_loss = nn.CrossEntropyLoss(weight=class_weights)

    for stage in range(4):
        print(f"[TRAIN] Этап {stage + 1}/4: подготовка...", flush=True)

        X = df[input_features[stage]].values
        y_cls = df['class_idx'].values
        y_reg_cols = output_features[stage][:-1]
        y_reg = df[y_reg_cols].values

        if X.shape[0] < 10:
            continue

        X_train, X_val, y_reg_train, y_reg_val, y_cls_train, y_cls_val = train_test_split(
            X, y_reg, y_cls, test_size=0.2, stratify=y_cls, random_state=42
        )

        scaler = StandardScaler().fit(X_train)
        new_scalers[stage] = scaler

        for i, col in enumerate(y_reg_cols):
            y_scaler = StandardScaler().fit(np.log1p(y_reg_train[:, i:i + 1]))
            new_y_scalers[col] = y_scaler

        # Применяем масштабирование к целевым переменным
        y_reg_train_scaled = np.zeros_like(y_reg_train, dtype=np.float32)
        y_reg_val_scaled = np.zeros_like(y_reg_val, dtype=np.float32)
        for i, col in enumerate(y_reg_cols):
            y_scaler = new_y_scalers[col]
            y_reg_train_scaled[:, i] = y_scaler.transform(np.log1p(y_reg_train[:, i:i+1])).flatten()
            y_reg_val_scaled[:, i] = y_scaler.transform(np.log1p(y_reg_val[:, i:i+1])).flatten()

        X_train_t = torch.tensor(scaler.transform(X_train), dtype=torch.float32)
        X_val_t = torch.tensor(scaler.transform(X_val), dtype=torch.float32)
        y_reg_train_t = torch.tensor(y_reg_train_scaled, dtype=torch.float32)
        y_reg_val_t = torch.tensor(y_reg_val_scaled, dtype=torch.float32)
        y_cls_train_t = torch.tensor(y_cls_train, dtype=torch.long)
        y_cls_val_t = torch.tensor(y_cls_val, dtype=torch.long)

        train_ds = TensorDataset(X_train_t, y_reg_train_t, y_cls_train_t)
        val_ds = TensorDataset(X_val_t, y_reg_val_t, y_cls_val_t)

        train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=64, shuffle=False)

        optimizer = torch.optim.Adam(training_model.parameters(), lr=0.0005)

        best_val_loss = float("inf")
        patience = 10
        patience_counter = 0
        max_epochs = 50

        for epoch in range(max_epochs):
            training_model.train()
            train_loss = 0.0
            for batch in train_loader:
                X_b = batch[0]
                y_reg_b = batch[1]
                y_cls_b = batch[2]

                optimizer.zero_grad()
                reg_pred, cls_pred = training_model(X_b, stage)
                loss = ce_loss(cls_pred, y_cls_b) + 0.5 * mse_loss(reg_pred, y_reg_b)
                loss.backward()
                optimizer.step()
                train_loss += loss.item()

            training_model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for batch in val_loader:
                    X_b = batch[0]
                    y_reg_b = batch[1]
                    y_cls_b = batch[2]
                    reg_pred, cls_pred = training_model(X_b, stage)
                    loss = ce_loss(cls_pred, y_cls_b) + 0.5 * mse_loss(reg_pred, y_reg_b)
                    val_loss += loss.item()

            val_loss = val_loss / max(len(val_loader), 1)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    break

    # Сохранение результата
    torch.save(training_model.state_dict(), os.path.join(BASE_DIR, "fire_prediction_model.pth"))
    with open(os.path.join(BASE_DIR, "scalers.pkl"), "wb") as f:
        pickle.dump({"scalers": new_scalers, "y_scalers": new_y_scalers}, f)

    print(f"[TRAIN] Done. Rows: {len(df)}. Model saved to {BASE_DIR}", flush=True)


if __name__ == "__main__":
    print("[TRAIN] Starting...")
    train()
    print("[TRAIN] Complete!")