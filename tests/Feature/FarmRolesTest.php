<?php

namespace Tests\Feature;

use App\Models\Pen;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Los roles de `farm_user` existían desde el principio y no se comprobaban en
 * ningún endpoint: un operario podía borrar ventas o cambiar la configuración.
 */
class FarmRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_operario_no_puede_vender(): void
    {
        [$user, $farm] = $this->makeFarmUser('operario');
        Sanctum::actingAs($user);

        $this->postJson('/api/sales', [
            'sold_at' => now()->toDateTimeString(),
            'total' => 5000,
        ], $this->farmHeaders($farm))
            ->assertForbidden();
    }

    public function test_un_operario_si_puede_registrar_la_operacion_diaria(): void
    {
        [$user, $farm] = $this->makeFarmUser('operario');
        Sanctum::actingAs($user);

        $this->postJson('/api/egg_collections', [
            'collection_at' => now()->toDateTimeString(),
            'total' => 30,
        ], $this->farmHeaders($farm))
            ->assertCreated();
    }

    public function test_un_vendedor_no_puede_tocar_los_catalogos(): void
    {
        [$user, $farm] = $this->makeFarmUser('vendedor');
        Sanctum::actingAs($user);

        $this->postJson('/api/pens', ['name' => 'Galpón nuevo'], $this->farmHeaders($farm))
            ->assertForbidden();

        $this->putJson('/api/farm', ['period_lock_days' => 0], $this->farmHeaders($farm))
            ->assertForbidden();
    }

    public function test_solo_el_admin_puede_borrar(): void
    {
        [$admin, $farm] = $this->makeFarmUser('admin');

        $this->activateFarm($farm);
        $pen = Pen::create(['name' => 'Galpón 1']);
        $sale = Sale::create(['sold_at' => now(), 'total' => 1000]);

        $vendedor = User::factory()->create();
        $farm->users()->attach($vendedor->id, ['role' => 'vendedor', 'active' => true, 'joined_at' => now()]);

        Sanctum::actingAs($vendedor);
        $this->deleteJson("/api/sales/{$sale->id}", [], $this->farmHeaders($farm))
            ->assertForbidden();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/pens/{$pen->id}", [], $this->farmHeaders($farm))
            ->assertOk();
    }

    public function test_un_miembro_inactivo_pierde_el_acceso(): void
    {
        [$user, $farm] = $this->makeFarmUser('admin');

        $farm->users()->updateExistingPivot($user->id, ['active' => false]);

        Sanctum::actingAs($user);

        $this->getJson('/api/pens', $this->farmHeaders($farm))->assertForbidden();
    }

    public function test_toda_escritura_queda_registrada_en_la_auditoria(): void
    {
        [$user, $farm] = $this->makeFarmUser('admin');
        Sanctum::actingAs($user);

        $this->postJson('/api/pens', ['name' => 'Galpón auditado'], $this->farmHeaders($farm))
            ->assertCreated();

        // La tabla `audit_logs` existía y nunca se escribía, así que no había
        // ninguna traza real de quién cambió qué en el servidor.
        $this->assertDatabaseHas('audit_logs', [
            'farm_id' => $farm->id,
            'user_id' => $user->id,
            'entity' => 'pens',
            'action' => 'create',
        ]);
    }

    public function test_el_creador_queda_registrado_en_el_propio_registro(): void
    {
        [$user, $farm] = $this->makeFarmUser('admin');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/egg_collections', [
            'collection_at' => now()->toDateTimeString(),
            'total' => 12,
        ], $this->farmHeaders($farm));

        $response->assertCreated();

        // `created_by` no era fillable y nunca se asignaba: la atribución de
        // autoría se perdía en el servidor.
        $this->assertDatabaseHas('egg_collections', [
            'id' => $response->json('id'),
            'created_by' => $user->id,
        ]);
    }
}
