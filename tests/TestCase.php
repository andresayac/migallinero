<?php

namespace Tests;

use App\Models\Farm;
use App\Models\User;
use App\Tenancy\ActiveFarmResolver;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Crea un usuario con su granja y devuelve ambos.
     *
     * @param  array<string, mixed>  $farmAttributes
     * @return array{0: User, 1: Farm}
     */
    protected function makeFarmUser(string $role = 'admin', array $farmAttributes = []): array
    {
        $user = User::factory()->create();

        $farm = Farm::create(array_merge([
            'name' => 'Granja de prueba',
            'owner_name' => $user->name,
            'period_lock_days' => 7,
            'currency' => 'COP',
            'country' => 'CO',
            'timezone' => 'America/Bogota',
            'locale' => 'es-CO',
        ], $farmAttributes));

        $farm->users()->attach($user->id, [
            'role' => $role,
            'active' => true,
            'joined_at' => now(),
        ]);

        return [$user, $farm];
    }

    /** Cabeceras para actuar sobre una granja concreta. */
    protected function farmHeaders(Farm $farm): array
    {
        return ['X-Farm-Id' => (string) $farm->id];
    }

    /** Activa el contexto de granja en pruebas que tocan los modelos directamente. */
    protected function activateFarm(Farm $farm, string $role = 'admin'): void
    {
        app(ActiveFarmResolver::class)->activate($farm->id, $role);
    }

    protected function tearDown(): void
    {
        app(ActiveFarmResolver::class)->clear();

        parent::tearDown();
    }
}
