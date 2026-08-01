<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad para toda la aplicación.
 *
 * La SPA es autocontenida (Vite genera los assets desde el mismo origen), así
 * que se puede aplicar una CSP restrictiva. Las fuentes se sirven localmente
 * para que la PWA funcione sin conexión, por eso no hace falta permitir CDNs.
 *
 * Los terceros que sí se necesiten (por ejemplo el script de Web Analytics que
 * Cloudflare inyecta) se declaran en `config/security.php`, no relajando la
 * política entera.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // El nonce se genera ANTES de renderizar la vista para que las etiquetas
        // de Vite y el script de registro del service worker lo lleven. Sin él,
        // `script-src 'self'` bloquea cualquier script en línea.
        Vite::useCspNonce();

        $response = $next($request);

        // El service worker se sirve desde la raíz para tener scope '/'.
        if ($request->path() === 'sw.js') {
            $response->headers->set('Service-Worker-Allowed', '/');
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), payment=()');

        // Sólo aplicamos CSP a documentos HTML: en JSON no aporta y complica la
        // depuración de la API.
        $isHtml = str_contains((string) $response->headers->get('Content-Type'), 'text/html');

        if ($isHtml && ! config('security.csp.disabled')) {
            $response->headers->set('Content-Security-Policy', $this->contentSecurityPolicy());
        }

        return $response;
    }

    private function contentSecurityPolicy(): string
    {
        // En desarrollo Vite sirve los módulos desde otro puerto y usa eval para
        // el recambio en caliente, así que la política se relaja.
        $dev = app()->environment('local');

        $nonce = Vite::cspNonce();

        $script = $this->sources('script_src', $dev
            ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'http://localhost:*', 'http://127.0.0.1:*']
            : ["'self'", "'nonce-{$nonce}'"]);

        // Los estilos NO llevan nonce a propósito: en cuanto hay uno, el
        // navegador ignora 'unsafe-inline' para los atributos `style`, y Vue los
        // usa en todas partes (el color de cada categoría de huevo, por ejemplo).
        $style = $this->sources('style_src', ["'self'", "'unsafe-inline'"]);

        $connect = $this->sources('connect_src', $dev
            ? ["'self'", 'ws:', 'http:', 'https:']
            : ["'self'"]);

        $img = $this->sources('img_src', ["'self'", 'data:', 'blob:']);
        $font = $this->sources('font_src', ["'self'", 'data:']);

        return implode('; ', [
            "default-src 'self'",
            'script-src '.$script,
            'style-src '.$style,
            'img-src '.$img,
            'font-src '.$font,
            'connect-src '.$connect,
            "worker-src 'self'",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]);
    }

    /**
     * Combina los orígenes por defecto con los declarados en configuración.
     *
     * @param  array<int, string>  $defaults
     */
    private function sources(string $directive, array $defaults): string
    {
        $extra = (array) config("security.csp.{$directive}", []);

        return implode(' ', array_unique([...$defaults, ...$extra]));
    }
}
