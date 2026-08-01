<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ResourceController;
use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
|
| Los limitadores `login`, `register`, `sync` y `api` se definen en
| AppServiceProvider::configureRateLimiting(). El grupo `api` de Laravel 11+
| NO incluye throttle por defecto, así que es obligatorio declararlo.
|
*/

// Auth pública (registro crea granja + devuelve token Sanctum)
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

// Auth requerida
Route::middleware('auth:sanctum', 'active.farm')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/auth/boot', [AuthController::class, 'boot']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/password', [AuthController::class, 'changePassword']);
    Route::post('/auth/pin', [AuthController::class, 'setPin'])->middleware('farm.role:admin');
    Route::post('/auth/pin/verify', [AuthController::class, 'verifyPin']);

    // Configuración de la granja activa (asistente guiado + Ajustes). Sólo admin.
    Route::put('/farm', [AuthController::class, 'updateFarm'])->middleware('farm.role:admin');

    // Resumen del Home (filtrado por granja activa y opcionalmente por galpón)
    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);

    // CRUD genérico multi-tenant por entidad. La autorización fina por rol y
    // entidad la aplica ResourceController vía FarmPermissions.
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
    Route::post('/sync/push', [SyncController::class, 'push'])->middleware('throttle:sync');
    Route::get('/sync/pull', [SyncController::class, 'pull']);
});
