<?php

namespace App\Providers;

use App\Tenancy\ActiveFarmResolver;
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
        //
    }
}
