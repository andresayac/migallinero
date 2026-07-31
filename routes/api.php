<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ResourceController;
use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

// Auth pública (registro crea granja + devuelve token Sanctum)
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

// Auth requerida
Route::middleware('auth:sanctum', 'active.farm')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/auth/boot', [AuthController::class, 'boot']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Configuración de la granja activa (asistente guiado + Ajustes)
    Route::put('/farm', [AuthController::class, 'updateFarm']);

    // Resumen del Home (filtrado por granja activa y opcionalmente por galpón)
    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);

    // CRUD genérico multi-tenant por entidad
    $entityPattern = 'pens|egg_categories|presentations|mortality_causes|egg_collections|chicken_movements|vaccines|incidents|customers|sales|payments|feed_types|feed_records|feed_purchases';

    Route::get('/{entity}', [ResourceController::class, 'index'])
        ->where('entity', $entityPattern);
    Route::post('/{entity}', [ResourceController::class, 'store'])
        ->where('entity', $entityPattern);
    Route::get('/{entity}/{id}', [ResourceController::class, 'show'])
        ->where('entity', $entityPattern)
        ->whereNumber('id');
    Route::put('/{entity}/{id}', [ResourceController::class, 'update'])
        ->where('entity', $entityPattern)
        ->whereNumber('id');
    Route::delete('/{entity}/{id}', [ResourceController::class, 'destroy'])
        ->where('entity', $entityPattern)
        ->whereNumber('id');

    // Sincronización offline idempotente
    Route::post('/sync/push', [SyncController::class, 'push']);
});
