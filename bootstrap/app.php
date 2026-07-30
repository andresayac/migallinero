<?php

use App\Http\Middleware\ClearActiveFarm;
use App\Http\Middleware\EnsureActiveFarm;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Alias reutilizables en rutas.
        $middleware->alias([
            'active.farm' => EnsureActiveFarm::class,
        ]);

        // Permite que el SW tenga scope '/' (para offline en todas las rutas).
        $middleware->append(\App\Http\Middleware\ServiceWorkerAllowed::class);

        // Limpiar la granja activa al final de cada petición (evita fugas entre requests).
        $middleware->append(ClearActiveFarm::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
