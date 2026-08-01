<?php

namespace Tests\Feature;

use App\Models\EggCollection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * El candado de período es el control anti-manipulación de la app. La
 * comprobación del cliente es sólo de interfaz: la que cuenta es esta, porque
 * cualquiera puede llamar a la API directamente.
 */
class PeriodLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_se_admiten_fechas_futuras(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->addDays(3)->toDateTimeString(),
            'total' => 30,
        ], $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJsonValidationErrors('collection_at');
    }

    public function test_ni_un_admin_puede_registrar_en_el_futuro(): void
    {
        [$user, $farm] = $this->makeFarmUser('admin');
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->addDay()->addHours(6)->toDateTimeString(),
            'total' => 30,
            'manual_reason' => 'me adelanto',
        ], $this->farmHeaders($farm))
            ->assertStatus(422);
    }

    public function test_dentro_de_la_ventana_se_admite(): void
    {
        [$user, $farm] = $this->makeFarmUser('operario', ['period_lock_days' => 7]);
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->subDays(3)->toDateTimeString(),
            'total' => 30,
        ], $this->farmHeaders($farm))
            ->assertCreated();
    }

    public function test_fuera_de_la_ventana_un_no_admin_es_rechazado(): void
    {
        [$user, $farm] = $this->makeFarmUser('operario', ['period_lock_days' => 7]);
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->subDays(20)->toDateTimeString(),
            'total' => 30,
            'manual_reason' => 'no hubo luz',
        ], $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJsonValidationErrors('collection_at');

        $this->activateFarm($farm);
        $this->assertSame(0, EggCollection::count());
    }

    public function test_fuera_de_la_ventana_un_admin_necesita_dar_un_motivo(): void
    {
        [$user, $farm] = $this->makeFarmUser('admin', ['period_lock_days' => 7]);
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->subDays(20)->toDateTimeString(),
            'total' => 30,
        ], $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJsonValidationErrors('manual_reason');

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->subDays(20)->toDateTimeString(),
            'total' => 30,
            'entry_mode' => 'manual',
            'manual_reason' => 'no hubo energía esa semana',
        ], $this->farmHeaders($farm))
            ->assertCreated();
    }

    public function test_el_dia_se_calcula_en_la_zona_horaria_de_la_granja(): void
    {
        [$user, $farm] = $this->makeFarmUser('operario', [
            'period_lock_days' => 0,
            'timezone' => 'America/Bogota',
        ]);

        Sanctum::actingAs($user);

        // Momento actual: 1 de agosto 06:00 UTC = 1 de agosto 01:00 en Bogotá.
        // "Hoy" en la granja es el 1 de agosto.
        $this->travelTo('2026-08-01 06:00:00');

        // Este registro es del 1 de agosto en UTC, pero de las 21:00 del 31 de
        // julio en Bogotá: para la granja es AYER. Con period_lock_days = 0 sólo
        // se admite hoy, así que debe rechazarse. Con la zona del servidor (UTC,
        // que es lo que usaba `config('app.timezone')`) se habría aceptado.
        $this->postJson('/api/egg_collections', [
            'collection_at' => '2026-08-01 02:00:00',
            'total' => 10,
        ], $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJsonValidationErrors('collection_at');

        // El mismo instante, pero ya dentro del día de la granja.
        $this->postJson('/api/egg_collections', [
            'collection_at' => '2026-08-01 05:30:00',
            'total' => 10,
        ], $this->farmHeaders($farm))
            ->assertCreated();

        $this->travelBack();
    }
}
