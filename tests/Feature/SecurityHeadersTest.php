<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_pagina_lleva_las_cabeceras_de_seguridad(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertNotNull($response->headers->get('Content-Security-Policy'));
    }

    public function test_la_api_no_lleva_csp(): void
    {
        // En JSON no aporta nada y estorba al depurar.
        $response = $this->getJson('/api/pens');

        $this->assertNull($response->headers->get('Content-Security-Policy'));
    }

    public function test_el_script_en_linea_lleva_el_nonce_de_la_csp(): void
    {
        // Con `script-src 'self'` un script en línea queda bloqueado. El script
        // que registra el service worker necesita el nonce, y el nonce del
        // documento tiene que coincidir con el de la cabecera: si no, la PWA se
        // queda sin service worker y la app no funciona sin conexión.
        config(['app.env' => 'production']);

        $response = $this->get('/');
        $csp = $response->headers->get('Content-Security-Policy');

        preg_match("/'nonce-([^']+)'/", (string) $csp, $matches);

        $this->assertNotEmpty($matches[1] ?? null, 'La CSP no declara ningún nonce.');
        $response->assertSee('nonce="'.$matches[1].'"', false);
    }

    public function test_los_estilos_admiten_atributos_en_linea(): void
    {
        // Vue usa :style en todas partes (el color de cada categoría de huevo).
        // Si style-src llevara un nonce, el navegador ignoraría 'unsafe-inline'
        // y esos atributos quedarían bloqueados.
        $csp = $this->get('/')->headers->get('Content-Security-Policy');

        preg_match('/style-src ([^;]+)/', (string) $csp, $matches);

        $this->assertStringContainsString("'unsafe-inline'", $matches[1]);
        $this->assertStringNotContainsString('nonce-', $matches[1]);
    }

    public function test_se_pueden_declarar_terceros_sin_relajar_la_politica(): void
    {
        // Caso real: Cloudflare inyecta su script de Web Analytics en cada página.
        config(['security.csp.script_src' => ['https://static.cloudflareinsights.com']]);

        $csp = $this->get('/')->headers->get('Content-Security-Policy');

        preg_match('/script-src ([^;]+)/', (string) $csp, $matches);

        $this->assertStringContainsString('https://static.cloudflareinsights.com', $matches[1]);
        // Y sigue sin permitir cualquier origen.
        $this->assertStringNotContainsString('*', $matches[1]);
    }

    public function test_las_urls_se_generan_en_https_cuando_app_url_lo_es(): void
    {
        // Detrás de Cloudflare en modo Flexible el origen recibe HTTP, así que
        // Laravel generaba `http://` dentro de una página `https://`. Para la CSP
        // eso es otro origen y bloqueaba todos los estilos y scripts de la app:
        // la pantalla salía en blanco.
        config(['app.url' => 'https://migallinero.example.com']);
        (new AppServiceProvider($this->app))->boot();

        $this->assertStringStartsWith('https://', URL::asset('build/assets/app.css'));
        $this->assertStringStartsWith('https://', URL::to('/eggs/new'));
    }

    public function test_en_local_las_urls_no_se_fuerzan_a_https(): void
    {
        // Forzar https en desarrollo rompería el servidor local, que va por http.
        config(['app.url' => 'http://localhost:8000']);
        (new AppServiceProvider($this->app))->boot();

        $this->assertStringStartsWith('http://', URL::asset('build/assets/app.css'));
    }

    public function test_el_service_worker_declara_su_alcance(): void
    {
        // Sin esta cabecera el navegador limita el alcance del worker y la app
        // no puede interceptar rutas como /eggs/new sin conexión.
        $path = public_path('sw.js');
        $existed = file_exists($path);

        if (! $existed) {
            file_put_contents($path, '// stub de prueba');
        }

        try {
            $this->get('/sw.js')->assertHeader('Service-Worker-Allowed', '/');
        } finally {
            if (! $existed) {
                @unlink($path);
            }
        }
    }
}
