<?php

use Illuminate\Support\Facades\Route;

// Catch-all: cualquier ruta que no sea /api/* sirve la SPA Vue.
// El router de Vue (history mode) maneja la navegación cliente-side.
Route::get('/{any?}', function () {
    return view('app');
})->where('any', '.*');
