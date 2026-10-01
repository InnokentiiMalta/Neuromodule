from fastapi import FastAPI, HTTPException
import torch
import torch.nn as nn  # Добавлен импорт torch.nn
import pickle
import numpy as np
import pandas as pd
from io import BytesIO
import os
import sys
from cryptography.fernet import Fernet

app = FastAPI()

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
    model.load_state_dict(torch.load(resource_path("fire_prediction_model.pth")))
    model.eval()
    with open(resource_path("scalers.pkl"), "rb") as f:
        scaler_data = pickle.load(f)
        scalers = scaler_data["scalers"]
        y_scalers = scaler_data["y_scalers"]
    print("Модель и скалеры успешно загружены")
except Exception as e:
    print(f"Ошибка загрузки модели или скалеров: {e}")
    raise

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
        X = np.array([input_data[feature] for feature in input_features[stage]]).reshape(1, -1)
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
                result[col] = y_scalers[col].inverse_transform(reg_pred[:, i:i+1])[0, 0]
                if col in ['Время_локализации_пожара_мин', 'Время_ликвидации_открытого_горения_мин',
                           'Время_ликвидации_последствий_пожара_мин', 'Время_тушения_мин']:
                    result[col] = max(1.0, min(result[col], 60.0))
        result['Всего_подано_пожарных_стволов_ед'] = cls_pred
        if stage == 2:
            result['Время_тушения_мин'] = (
                input_data['Время_локализации_пожара_мин'] +
                input_data['Время_ликвидации_открытого_горения_мин']
            )
        return result

@app.post("/predict")
async def predict(data: dict):
    try:
        input_data = data.get("input_data", {})
        stage = data.get("stage", 0)
        result = predict_fire_parameters(model, scalers, y_scalers, input_data, stage)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка предсказания: {str(e)}")

@app.post("/data")
async def receive_data(data: dict):
    try:
        print(f"Получены данные от клиента: {data}")
        return {"status": "success", "message": "Данные получены"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки данных: {str(e)}")

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