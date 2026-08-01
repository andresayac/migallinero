<?php

namespace App\Providers;

use App\Tenancy\ActiveFarmResolver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Scoped singleton: una instancia por petición/worker.
        // Así activate() en el middleware e id() en el trait operan
        // sobre el MISMO objeto dentro del mismo request.
        $this->app->scoped(ActiveFarmResolver::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
        $this->configureModels();
    }

    /**
     * Limitadores de la API.
     *
     * Sin esto el grupo `api` de Laravel 11+ no lleva throttle: /auth/login
     * quedaría abierto a fuerza bruta ilimitada.
     */
    protected function configureRateLimiting(): void
    {
        // Limitador general: por token si está autenticado, por IP si no.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->id ?: $request->ip()));

        // Autenticación: agresivo y por (usuario + IP) para que un atacante no
        // pueda bloquear a un usuario legítimo saturando su cuenta.
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by('login:'.strtolower((string) $request->input('username')).'|'.$request->ip()),
            Limit::perMinute(20)->by('login-ip:'.$request->ip()),
        ]);

        // Registro: crear cuentas es caro (siembra catálogos), lo limitamos por IP.
        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));

        // Sincronización: lotes grandes pero no ilimitados.
        RateLimiter::for('sync', fn (Request $request) => Limit::perMinute(30)
            ->by($request->user()?->id ?: $request->ip()));
    }

    protected function configureModels(): void
    {
        // Falla ruidosamente si un payload trae atributos que no son fillable,
        // en vez de descartarlos en silencio (así detectamos campos mal
        // nombrados en la sincronización durante el desarrollo).
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
    }
}
