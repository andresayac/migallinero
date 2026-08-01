<?php

use App\Http\Middleware\ClearActiveFarm;
use App\Http\Middleware\EnsureActiveFarm;
use App\Http\Middleware\EnsureFarmRole;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\SecurityHeaders;
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
        // Confiar sólo en los proxies declarados en TRUSTED_PROXIES. Confiar en
        // '*' permite falsificar la IP del cliente vía X-Forwarded-For, lo que
        // anula el rate limiting y envenena los logs.
        $middleware->trustProxies(at: array_values(array_filter(
            array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1')))
        )));

        // Rate limiting de la API (limitadores definidos en AppServiceProvider).
        $middleware->throttleApi();

        // Toda la API responde JSON, incluidos los errores.
        $middleware->prependToGroup('api', ForceJsonResponse::class);

        // Esta app no tiene ruta `login`: la pantalla de acceso la sirve el
        // router de Vue. Sin esto, una petición de navegador a una ruta
        // protegida provocaba un 500 al intentar resolver route('login').
        $middleware->redirectGuestsTo('/welcome');

        // Alias reutilizables en rutas.
        $middleware->alias([
            'active.farm' => EnsureActiveFarm::class,
            'farm.role' => EnsureFarmRole::class,
        ]);

        // Cabeceras de seguridad + Service-Worker-Allowed en todas las respuestas.
        $middleware->append(SecurityHeaders::class);

        // Limpiar la granja activa al final de cada petición (evita fugas entre requests).
        $middleware->append(ClearActiveFarm::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Nunca devolver HTML de depuración a un cliente que espera JSON.
        $exceptions->shouldRenderJsonWhen(
            fn ($request) => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
