<?php

namespace App\Tenancy;

use App\Models\ChickenMovement;
use App\Models\Customer;
use App\Models\EggCategory;
use App\Models\EggCollection;
use App\Models\FeedPurchase;
use App\Models\FeedRecord;
use App\Models\FeedType;
use App\Models\Incident;
use App\Models\MortalityCause;
use App\Models\Payment;
use App\Models\Pen;
use App\Models\Presentation;
use App\Models\Sale;
use App\Models\Vaccine;

/**
 * Registro único de entidades sincronizables.
 *
 * Antes había dos mapas separados (uno en ResourceController y otro en
 * SyncController) que se desincronizaron: el CRUD aceptaba `feed_records` y
 * `feed_purchases` pero la sincronización los rechazaba con 400, así que los
 * módulos de alimento nunca subían al servidor y la cola local no drenaba.
 * Con un solo registro eso no puede volver a pasar.
 */
class EntityRegistry
{
    /**
     * entity => [clase del modelo, relaciones anidadas, relaciones a cargar]
     *
     * @var array<string, array{model: class-string, lines: bool, with: array<int, string>}>
     */
    private const ENTITIES = [
        'pens' => ['model' => Pen::class, 'lines' => false, 'with' => []],
        'egg_categories' => ['model' => EggCategory::class, 'lines' => false, 'with' => []],
        'presentations' => ['model' => Presentation::class, 'lines' => false, 'with' => []],
        'mortality_causes' => ['model' => MortalityCause::class, 'lines' => false, 'with' => []],
        'feed_types' => ['model' => FeedType::class, 'lines' => false, 'with' => []],
        'customers' => ['model' => Customer::class, 'lines' => false, 'with' => []],
        'egg_collections' => ['model' => EggCollection::class, 'lines' => true, 'with' => ['lines', 'pen']],
        'chicken_movements' => ['model' => ChickenMovement::class, 'lines' => false, 'with' => ['pen']],
        'vaccines' => ['model' => Vaccine::class, 'lines' => false, 'with' => ['pen']],
        'incidents' => ['model' => Incident::class, 'lines' => false, 'with' => ['pen']],
        'sales' => ['model' => Sale::class, 'lines' => true, 'with' => ['lines', 'customer']],
        'payments' => ['model' => Payment::class, 'lines' => false, 'with' => []],
        'feed_records' => ['model' => FeedRecord::class, 'lines' => true, 'with' => ['lines', 'pen']],
        'feed_purchases' => ['model' => FeedPurchase::class, 'lines' => true, 'with' => ['lines']],
    ];

    /** @return array<int, string> */
    public static function names(): array
    {
        return array_keys(self::ENTITIES);
    }

    public static function has(string $entity): bool
    {
        return isset(self::ENTITIES[$entity]);
    }

    /** @return class-string */
    public static function model(string $entity): string
    {
        return self::ENTITIES[$entity]['model'];
    }

    public static function hasLines(string $entity): bool
    {
        return self::ENTITIES[$entity]['lines'];
    }

    /** @return array<int, string> */
    public static function relations(string $entity): array
    {
        return self::ENTITIES[$entity]['with'];
    }

    /**
     * Campos FK que el cliente offline puede enviar como local_uuid y hay que
     * traducir al id numérico del backend, con la entidad a la que apuntan.
     *
     * @return array<string, string>
     */
    public static function foreignKeys(): array
    {
        return [
            'pen_id' => 'pens',
            'egg_category_id' => 'egg_categories',
            'presentation_id' => 'presentations',
            'feed_type_id' => 'feed_types',
            'customer_id' => 'customers',
            'sale_id' => 'sales',
            'egg_collection_id' => 'egg_collections',
        ];
    }

    /** Patrón para las restricciones de ruta (`->where('entity', ...)`). */
    public static function routePattern(): string
    {
        return implode('|', self::names());
    }
}
