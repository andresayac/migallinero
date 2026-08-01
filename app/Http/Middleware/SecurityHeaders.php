<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad para toda la aplicación.
 *
 * La SPA es autocontenida (Vite genera los assets desde el mismo origen), así
 * que podemos aplicar una CSP restrictiva. Las fuentes se sirven localmente
 * para que la PWA funcione sin conexión, por eso no hace falta permitir CDNs.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // El service worker se sirve desde la raíz para tener scope '/'.
        if ($request->path() === 'sw.js') {
            $response->headers->set('Service-Worker-Allowed', '/');
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), payment=()');

        // Sólo aplicamos CSP a documentos HTML: en JSON no aporta y complica
        // la depuración de la API.
        $isHtml = str_contains((string) $response->headers->get('Content-Type'), 'text/html');

        if ($isHtml) {
            // En desarrollo Vite inyecta su cliente HMR vía websocket y usa
            // scripts/estilos inline, por lo que relajamos la política.
            $dev = app()->environment('local');

            $csp = [
                "default-src 'self'",
                // 'unsafe-inline' es necesario para los estilos inline que Vue
                // genera con :style; no hay riesgo de ejecución de scripts.
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                $dev
                    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                    : "script-src 'self'",
                $dev
                    ? 'connect-src '."'self' ws: http: https:"
                    : "connect-src 'self'",
            ];

            $response->headers->set('Content-Security-Policy', implode('; ', $csp));
        }

        return $response;
    }
}
