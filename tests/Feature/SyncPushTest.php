<?php

namespace Tests\Feature;

use App\Models\ChickenMovement;
use App\Models\Customer;
use App\Models\EggCategory;
use App\Models\EggCollection;
use App\Models\FeedPurchase;
use App\Models\FeedRecord;
use App\Models\FeedType;
use App\Models\Pen;
use App\Models\Sale;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SyncPushTest extends TestCase
{
    use RefreshDatabase;

    private function push(array $items, array $headers): TestResponse
    {
        return $this->postJson('/api/sync/push', ['items' => $items], $headers);
    }

    public function test_el_push_es_idempotente_por_local_uuid(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        $item = [
            'entity' => 'egg_collections',
            'action' => 'create',
            'local_uuid' => 'uuid-tanda-1',
            'payload' => [
                'collectionAt' => now()->toDateTimeString(),
                'total' => 30,
            ],
        ];

        $this->push([$item], $this->farmHeaders($farm))->assertOk();
        $this->push([$item], $this->farmHeaders($farm))->assertOk();

        $this->activateFarm($farm);
        $this->assertSame(1, EggCollection::count());
    }

    public function test_los_registros_de_alimento_ahora_si_sincronizan(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $pen = Pen::create(['name' => 'Galpón 1']);
        $feedType = FeedType::create(['name' => 'Concentrado', 'unit' => 'kg']);

        Sanctum::actingAs($user);

        // `feed_records` y `feed_purchases` no existían en el mapa del
        // SyncController: se rechazaban con 400 en cada intento y la cola local
        // no drenaba nunca.
        $response = $this->push([
            [
                'entity' => 'feed_records',
                'action' => 'create',
                'local_uuid' => 'uuid-consumo-1',
                'payload' => [
                    'penId' => $pen->local_uuid ?? $pen->id,
                    'recordedAt' => now()->toDateTimeString(),
                    'shift' => 'morning',
                    'lines' => [
                        ['feedTypeId' => $feedType->id, 'qty' => 12.5, 'unitCost' => 2000, 'subtotal' => 25000],
                    ],
                ],
            ],
            [
                'entity' => 'feed_purchases',
                'action' => 'create',
                'local_uuid' => 'uuid-compra-1',
                'payload' => [
                    'purchasedAt' => now()->toDateTimeString(),
                    'supplier' => 'Agroinsumos',
                    'lines' => [
                        ['feedTypeId' => $feedType->id, 'bags' => 2, 'kgPerBag' => 40.5, 'unitCost' => 90000, 'subtotal' => 180000],
                    ],
                ],
            ],
        ], $this->farmHeaders($farm));

        $response->assertOk();
        $this->assertSame([], $response->json('errors'));

        $this->activateFarm($farm);

        $record = FeedRecord::firstOrFail();
        $this->assertEquals(12.5, (float) $record->total_qty);
        $this->assertSame(25000, $record->total_cost);

        $purchase = FeedPurchase::firstOrFail();
        $this->assertSame(2, $purchase->total_bags);
        $this->assertEquals(81.0, (float) $purchase->total_qty);
        $this->assertSame(180000, $purchase->total_cost);
    }

    public function test_los_movimientos_de_gallinas_requieren_la_fecha_operativa(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        // El cliente guardaba la fecha en `createdAt` y no enviaba `movementAt`;
        // la columna es NOT NULL, así que el INSERT fallaba en cada intento.
        $sinFecha = $this->push([[
            'entity' => 'chicken_movements',
            'action' => 'create',
            'local_uuid' => 'uuid-mov-1',
            'payload' => ['type' => 'death', 'qty' => 3],
        ]], $this->farmHeaders($farm));

        $sinFecha->assertOk();
        $this->assertTrue($sinFecha->json('errors.0.permanent'));

        $conFecha = $this->push([[
            'entity' => 'chicken_movements',
            'action' => 'create',
            'local_uuid' => 'uuid-mov-2',
            'payload' => [
                'type' => 'death',
                'qty' => 3,
                'movementAt' => now()->toDateTimeString(),
            ],
        ]], $this->farmHeaders($farm));

        $conFecha->assertOk();
        $this->assertSame([], $conFecha->json('errors'));

        $this->activateFarm($farm);
        $this->assertSame(1, ChickenMovement::count());
    }

    public function test_una_fk_desconocida_falla_en_vez_de_guardarse_como_null(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        // Antes `$related?->id` dejaba la FK en NULL sin avisar, así que en el
        // servidor todas las ventas terminaban sin cliente.
        $response = $this->push([[
            'entity' => 'sales',
            'action' => 'create',
            'local_uuid' => 'uuid-venta-1',
            'payload' => [
                'customerId' => 'uuid-cliente-que-no-existe',
                'soldAt' => now()->toDateTimeString(),
                'total' => 5000,
            ],
        ]], $this->farmHeaders($farm));

        $response->assertOk();
        $this->assertTrue($response->json('errors.0.permanent'));

        $this->activateFarm($farm);
        $this->assertSame(0, Sale::count());
    }

    public function test_las_fk_se_resuelven_por_local_uuid(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $customer = Customer::create(['name' => 'Doña Ana', 'local_uuid' => 'uuid-cliente-1']);
        $category = EggCategory::create(['name' => 'AA', 'local_uuid' => 'uuid-cat-1']);

        Sanctum::actingAs($user);

        $this->push([[
            'entity' => 'sales',
            'action' => 'create',
            'local_uuid' => 'uuid-venta-2',
            'payload' => [
                'customerId' => 'uuid-cliente-1',
                'soldAt' => now()->toDateTimeString(),
                'total' => 6000,
                'paid' => 6000,
                'lines' => [
                    ['categoryId' => 'uuid-cat-1', 'qtyUnits' => 30, 'unitPrice' => 200, 'subtotal' => 6000],
                ],
            ],
        ]], $this->farmHeaders($farm))->assertOk();

        $sale = Sale::with('lines')->firstOrFail();

        $this->assertSame($customer->id, $sale->customer_id);
        $this->assertSame($category->id, $sale->lines->first()->egg_category_id);
    }

    public function test_los_totales_se_recalculan_desde_las_lineas(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $category = EggCategory::create(['name' => 'AA', 'local_uuid' => 'uuid-cat-1']);

        Sanctum::actingAs($user);

        // Un cliente manipulado podría enviar 500 huevos en las líneas y total=1.
        $this->push([[
            'entity' => 'egg_collections',
            'action' => 'create',
            'local_uuid' => 'uuid-tanda-2',
            'payload' => [
                'collectionAt' => now()->toDateTimeString(),
                'total' => 1,
                'lines' => [
                    ['categoryId' => $category->id, 'qty' => 300],
                    ['categoryId' => $category->id, 'qty' => 200],
                ],
            ],
        ]], $this->farmHeaders($farm))->assertOk();

        $this->assertSame(500, EggCollection::firstOrFail()->total);
    }

    public function test_una_venta_anulada_queda_sin_saldo_ni_pagado(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $category = EggCategory::create(['name' => 'AA', 'local_uuid' => 'uuid-cat-1']);

        Sanctum::actingAs($user);

        $venta = [
            'soldAt' => now()->toDateTimeString(),
            'total' => 15000,
            'paid' => 5000,
            'lines' => [
                ['categoryId' => $category->id, 'qtyUnits' => 30, 'unitPrice' => 500, 'subtotal' => 15000],
            ],
        ];

        $this->push([[
            'entity' => 'sales',
            'action' => 'create',
            'local_uuid' => 'uuid-venta-anulable',
            'payload' => $venta,
        ]], $this->farmHeaders($farm))->assertOk();

        // Anular: el recálculo de totales devolvía `balance = total`, así que una
        // venta anulada aparecía como la mayor deuda del cliente.
        $this->push([[
            'entity' => 'sales',
            'action' => 'update',
            'local_uuid' => 'uuid-venta-anulable',
            'payload' => $venta + ['status' => 'void', 'paid' => 0, 'balance' => 0],
        ]], $this->farmHeaders($farm))->assertOk();

        $sale = Sale::firstOrFail();

        $this->assertSame('void', $sale->status);
        $this->assertSame(0, $sale->paid);
        $this->assertSame(0, $sale->balance);
        $this->assertSame(15000, $sale->total);
    }

    public function test_el_estado_de_la_venta_se_deriva_de_lo_pagado(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $category = EggCategory::create(['name' => 'AA', 'local_uuid' => 'uuid-cat-1']);

        Sanctum::actingAs($user);

        // El cliente dice "paid" aunque sólo pagó una parte: manda el servidor.
        $this->push([[
            'entity' => 'sales',
            'action' => 'create',
            'local_uuid' => 'uuid-venta-estado',
            'payload' => [
                'soldAt' => now()->toDateTimeString(),
                'total' => 15000,
                'paid' => 5000,
                'status' => 'paid',
                'lines' => [
                    ['categoryId' => $category->id, 'qtyUnits' => 30, 'unitPrice' => 500, 'subtotal' => 15000],
                ],
            ],
        ]], $this->farmHeaders($farm))->assertOk();

        $sale = Sale::firstOrFail();

        $this->assertSame('partial', $sale->status);
        $this->assertSame(10000, $sale->balance);
    }

    public function test_una_actualizacion_sin_lineas_no_pone_los_totales_a_cero(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $this->activateFarm($farm);

        $category = EggCategory::create(['name' => 'AA', 'local_uuid' => 'uuid-cat-1']);

        Sanctum::actingAs($user);

        $this->push([[
            'entity' => 'egg_collections',
            'action' => 'create',
            'local_uuid' => 'uuid-tanda-parcial',
            'payload' => [
                'collectionAt' => now()->toDateTimeString(),
                'lines' => [['categoryId' => $category->id, 'qty' => 120]],
            ],
        ]], $this->farmHeaders($farm))->assertOk();

        $this->assertSame(120, EggCollection::firstOrFail()->total);

        // Actualización parcial: sólo la observación, sin líneas. El recálculo no
        // debe interpretar "sin líneas en el payload" como "cero huevos".
        $this->push([[
            'entity' => 'egg_collections',
            'action' => 'update',
            'local_uuid' => 'uuid-tanda-parcial',
            'payload' => ['observation' => 'muchas gallinas en el nido 3'],
        ]], $this->farmHeaders($farm))->assertOk();

        $collection = EggCollection::firstOrFail();

        $this->assertSame(120, $collection->total);
        $this->assertSame('muchas gallinas en el nido 3', $collection->observation);
        $this->assertCount(1, $collection->lines);
    }

    public function test_el_lote_esta_acotado(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        $items = array_map(fn ($i) => [
            'entity' => 'egg_collections',
            'action' => 'create',
            'local_uuid' => "uuid-{$i}",
            'payload' => ['collectionAt' => now()->toDateTimeString(), 'total' => 1],
        ], range(1, 501));

        $this->push($items, $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJsonValidationErrors('items');
    }

    public function test_los_errores_no_exponen_detalles_internos_del_servidor(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        Sanctum::actingAs($user);

        $response = $this->push([[
            'entity' => 'sales',
            'action' => 'create',
            'local_uuid' => 'uuid-venta-3',
            'payload' => ['total' => 'no-es-un-numero'],
        ]], $this->farmHeaders($farm));

        $response->assertOk();

        $message = $response->json('errors.0.message');

        // El mensaje anterior traía el SQL completo con nombres de tabla y valores.
        $this->assertIsString($message);
        $this->assertStringNotContainsStringIgnoringCase('select', $message);
        $this->assertStringNotContainsStringIgnoringCase('insert into', $message);
        $this->assertStringNotContainsStringIgnoringCase('sqlstate', $message);
    }

    public function test_el_pull_devuelve_solo_los_datos_de_la_granja_activa(): void
    {
        [$userA, $farmA] = $this->makeFarmUser();
        [, $farmB] = $this->makeFarmUser();

        $this->activateFarm($farmA);
        Pen::create(['name' => 'Galpón A']);

        $this->activateFarm($farmB);
        Pen::create(['name' => 'Galpón B']);

        Sanctum::actingAs($userA);

        $response = $this->getJson('/api/sync/pull?entities[]=pens', $this->farmHeaders($farmA));

        $response->assertOk();
        $this->assertSame(['Galpón A'], array_column($response->json('data.pens'), 'name'));
        $this->assertFalse($response->json('truncated'));
    }
}
