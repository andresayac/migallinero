<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Pen;
use App\Models\Sale;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * El aislamiento entre granjas es la garantía central de la aplicación: los
 * datos de un granjero no pueden aparecer nunca en la cuenta de otro.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_se_pueden_leer_registros_de_otra_granja(): void
    {
        [$userA, $farmA] = $this->makeFarmUser();
        [, $farmB] = $this->makeFarmUser();

        $this->activateFarm($farmA);
        $penA = Pen::create(['name' => 'Galpón A']);

        $this->activateFarm($farmB);
        Pen::create(['name' => 'Galpón B']);

        Sanctum::actingAs($userA);

        $response = $this->getJson('/api/pens', $this->farmHeaders($farmA));

        $response->assertOk();
        $this->assertSame(['Galpón A'], array_column($response->json('data'), 'name'));
        $this->assertSame($penA->id, $response->json('data.0.id'));
    }

    public function test_acceder_por_id_a_un_registro_de_otra_granja_devuelve_404(): void
    {
        [$userA, $farmA] = $this->makeFarmUser();
        [, $farmB] = $this->makeFarmUser();

        $this->activateFarm($farmB);
        $penB = Pen::create(['name' => 'Galpón ajeno']);

        Sanctum::actingAs($userA);

        $this->getJson("/api/pens/{$penB->id}", $this->farmHeaders($farmA))
            ->assertNotFound();

        $this->putJson("/api/pens/{$penB->id}", ['name' => 'Secuestrado'], $this->farmHeaders($farmA))
            ->assertNotFound();

        $this->deleteJson("/api/pens/{$penB->id}", [], $this->farmHeaders($farmA))
            ->assertNotFound();

        $this->assertSame('Galpón ajeno', $penB->fresh()->name);
    }

    public function test_pedir_una_granja_a_la_que_no_pertenece_devuelve_403(): void
    {
        [$userA] = $this->makeFarmUser();
        [, $farmB] = $this->makeFarmUser();

        Sanctum::actingAs($userA);

        $this->getJson('/api/pens', $this->farmHeaders($farmB))
            ->assertForbidden();
    }

    public function test_una_cabecera_de_granja_invalida_no_se_coerciona_a_un_id_numerico(): void
    {
        [$user, $farm] = $this->makeFarmUser();

        Sanctum::actingAs($user);

        // '1abc' se comparaba como 1 en MySQL, dando acceso a la granja 1.
        $this->getJson('/api/pens', ['X-Farm-Id' => $farm->id.'abc'])
            ->assertStatus(422);
    }

    public function test_no_se_puede_referenciar_un_cliente_de_otra_granja(): void
    {
        [$userA, $farmA] = $this->makeFarmUser();
        [, $farmB] = $this->makeFarmUser();

        $this->activateFarm($farmB);
        $customerB = Customer::create(['name' => 'Cliente ajeno']);

        Sanctum::actingAs($userA);

        $this->postJson('/api/sales', [
            'customer_id' => $customerB->id,
            'sold_at' => now()->toDateTimeString(),
            'total' => 1000,
        ], $this->farmHeaders($farmA))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');

        $this->activateFarm($farmA);
        $this->assertSame(0, Sale::count());
    }
}
