<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Permite que el service worker en /build/sw.js tenga scope '/'.
 * Sin este header, el navegador limita el scope a /build/ y el SW
 * no puede interceptar rutas como /eggs/new en modo offline.
 */
class ServiceWorkerAllowed
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->path() === 'build/sw.js') {
            $response->headers->set('Service-Worker-Allowed', '/');
        }

        return $response;
    }
}