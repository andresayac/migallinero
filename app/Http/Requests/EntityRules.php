<?php

namespace App\Http\Requests;

use App\Tenancy\ActiveFarmResolver;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * Reglas de validación por entidad para el CRUD genérico y la sincronización.
 *
 * Antes no había ninguna validación: se aceptaban precios negativos, cantidades
 * absurdas, fechas futuras y FKs de otras granjas. Aquí centralizamos todo para
 * que el CRUD REST y `/sync/push` compartan exactamente las mismas reglas.
 *
 * Las claves llegan ya en snake_case.
 */
class EntityRules
{
    /** Máximos defensivos: una granja real no supera estos valores. */
    private const MAX_QTY = 1_000_000;

    private const MAX_MONEY = 999_999_999_999;

    /**
     * @return array<string, mixed>
     */
    public static function for(string $entity, bool $isUpdate = false): array
    {
        $rules = match ($entity) {
            'pens' => [
                'name' => ['required', 'string', 'max:120'],
                'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
                'active' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            ],
            'egg_categories' => [
                'name' => ['required', 'string', 'max:120'],
                'short' => ['sometimes', 'nullable', 'string', 'max:12'],
                'sellable' => ['sometimes', 'boolean'],
                'is_broken' => ['sometimes', 'boolean'],
                'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
                'active' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            ],
            'presentations' => [
                'code' => ['required', 'string', Rule::in(['unit', 'cubeta', 'torre', 'custom'])],
                'name' => ['required', 'string', 'max:120'],
                'units_per_pack' => ['required', 'integer', 'min:1', 'max:100000'],
                'active' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            ],
            'mortality_causes' => [
                'name' => ['required', 'string', 'max:120'],
                'active' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            ],
            'feed_types' => [
                'name' => ['required', 'string', 'max:120'],
                'unit' => ['sometimes', 'string', 'max:16'],
                'active' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            ],
            'customers' => [
                'name' => ['required', 'string', 'max:160'],
                'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
                'address' => ['sometimes', 'nullable', 'string', 'max:255'],
                'id_number' => ['sometimes', 'nullable', 'string', 'max:40'],
                'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'balance' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'active' => ['sometimes', 'boolean'],
            ],
            'egg_collections' => [
                'pen_id' => ['sometimes', 'nullable', 'integer', self::inFarm('pens')],
                'collection_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'observation' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'total' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'lines' => ['sometimes', 'array', 'max:100'],
                'lines.*.egg_category_id' => ['sometimes', 'nullable', 'integer', self::inFarm('egg_categories')],
                'lines.*.category_name' => ['sometimes', 'nullable', 'string', 'max:120'],
                'lines.*.qty' => ['required_with:lines', 'integer', 'min:0', 'max:'.self::MAX_QTY],
            ],
            'chicken_movements' => [
                'pen_id' => ['sometimes', 'nullable', 'integer', self::inFarm('pens')],
                'type' => ['required', Rule::in(['buy', 'birth', 'death', 'sale', 'revoke', 'transfer', 'adjust'])],
                'qty' => ['required', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'movement_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'reason' => ['sometimes', 'nullable', 'string', 'max:255'],
                'observation' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'photo_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            ],
            'vaccines' => [
                'name' => ['required', 'string', 'max:160'],
                'batch' => ['sometimes', 'nullable', 'string', 'max:80'],
                'dose' => ['sometimes', 'nullable', 'string', 'max:80'],
                'expires_at' => ['sometimes', 'nullable', 'date'],
                'applied_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'next_at' => ['sometimes', 'nullable', 'date'],
                'pen_id' => ['sometimes', 'nullable', 'integer', self::inFarm('pens')],
                'qty_chickens' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'responsible' => ['sometimes', 'nullable', 'string', 'max:160'],
                'observation' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'photo_path' => ['sometimes', 'nullable', 'string', 'max:255'],
            ],
            'incidents' => [
                'type' => ['required', 'string', 'max:80'],
                'pen_id' => ['sometimes', 'nullable', 'integer', self::inFarm('pens')],
                'description' => ['required', 'string', 'max:2000'],
                'severity' => ['sometimes', Rule::in(['low', 'med', 'high'])],
                'status' => ['sometimes', Rule::in(['open', 'reviewed', 'solved'])],
                'solved_at' => ['sometimes', 'nullable', 'date'],
            ],
            'sales' => [
                'customer_id' => ['sometimes', 'nullable', 'integer', self::inFarm('customers')],
                'sold_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'total' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'discount' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'paid' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'balance' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'status' => ['sometimes', Rule::in(['paid', 'partial', 'pending', 'void'])],
                'payment_method' => ['sometimes', 'nullable', 'string', 'max:40'],
                'promised_payment_at' => ['sometimes', 'nullable', 'date'],
                'observation' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'lines' => ['sometimes', 'array', 'max:100'],
                'lines.*.egg_category_id' => ['sometimes', 'nullable', 'integer', self::inFarm('egg_categories')],
                'lines.*.presentation_id' => ['sometimes', 'nullable', 'integer', self::inFarm('presentations')],
                'lines.*.qty_packs' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_QTY],
                'lines.*.qty_units' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'lines.*.unit_price' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'lines.*.subtotal' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
            ],
            'payments' => [
                // sale_id es opcional: un abono puede aplicarse al saldo global
                // del cliente sin estar atado a una venta concreta.
                'sale_id' => ['sometimes', 'nullable', 'integer', self::inFarm('sales')],
                'customer_id' => ['sometimes', 'nullable', 'integer', self::inFarm('customers')],
                'amount' => ['required', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'method' => ['sometimes', 'nullable', 'string', 'max:40'],
                'paid_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'observation' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'voided_at' => ['sometimes', 'nullable', 'date'],
            ],
            'feed_records' => [
                'pen_id' => ['sometimes', 'nullable', 'integer', self::inFarm('pens')],
                'recorded_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'shift' => ['sometimes', Rule::in(['morning', 'afternoon'])],
                'observation' => ['sometimes', 'nullable', 'string', 'max:255'],
                'total_qty' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_QTY],
                'total_cost' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'lines' => ['sometimes', 'array', 'max:100'],
                'lines.*.feed_type_id' => ['sometimes', 'nullable', 'integer', self::inFarm('feed_types')],
                'lines.*.feed_type_name' => ['sometimes', 'nullable', 'string', 'max:120'],
                'lines.*.qty' => ['required_with:lines', 'numeric', 'min:0', 'max:'.self::MAX_QTY],
                'lines.*.unit_cost' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'lines.*.subtotal' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
            ],
            'feed_purchases' => [
                'purchased_at' => ['required', 'date', 'before_or_equal:'.self::maxDate()],
                'supplier' => ['sometimes', 'nullable', 'string', 'max:160'],
                'observation' => ['sometimes', 'nullable', 'string', 'max:255'],
                'total_bags' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'total_qty' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_QTY],
                'total_cost' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'lines' => ['sometimes', 'array', 'max:100'],
                'lines.*.feed_type_id' => ['sometimes', 'nullable', 'integer', self::inFarm('feed_types')],
                'lines.*.feed_type_name' => ['sometimes', 'nullable', 'string', 'max:120'],
                'lines.*.bags' => ['required_with:lines', 'integer', 'min:0', 'max:'.self::MAX_QTY],
                'lines.*.kg_per_bag' => ['sometimes', 'numeric', 'min:0', 'max:10000'],
                'lines.*.unit_cost' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
                'lines.*.subtotal' => ['sometimes', 'numeric', 'min:0', 'max:'.self::MAX_MONEY],
            ],
            default => [],
        };

        // Campos comunes a todos los registros sincronizables.
        $rules['local_uuid'] = ['sometimes', 'nullable', 'string', 'max:64'];
        $rules['entry_mode'] = ['sometimes', Rule::in(['auto', 'manual'])];
        $rules['manual_reason'] = ['sometimes', 'nullable', 'string', 'max:500'];

        // En una actualización parcial nada es obligatorio: el registro ya
        // existe y sólo se validan los campos que vengan en la petición.
        if ($isUpdate) {
            $rules = array_map(self::relaxRequired(...), $rules);
        }

        return $rules;
    }

    /**
     * Convierte `required` en `sometimes` para las actualizaciones parciales.
     *
     * @param  array<int, mixed>  $set
     * @return array<int, mixed>
     */
    private static function relaxRequired(array $set): array
    {
        $out = ['sometimes'];

        foreach ($set as $rule) {
            if (is_string($rule) && ($rule === 'required' || $rule === 'sometimes' || str_starts_with($rule, 'required_with'))) {
                continue;
            }
            $out[] = $rule;
        }

        return $out;
    }

    /**
     * Los campos con fecha operativa respetan el candado de período de la
     * granja: nadie registra en el futuro, y sólo un admin puede registrar más
     * atrás de `period_lock_days`.
     *
     * @return array<int, string> nombres de campo con fecha operativa
     */
    public static function operationalDateFields(string $entity): array
    {
        return match ($entity) {
            'egg_collections' => ['collection_at'],
            'chicken_movements' => ['movement_at'],
            'vaccines' => ['applied_at'],
            'sales' => ['sold_at'],
            'payments' => ['paid_at'],
            'feed_records' => ['recorded_at'],
            'feed_purchases' => ['purchased_at'],
            default => [],
        };
    }

    /** Fecha máxima aceptada: hoy + 1 día de margen por relojes desfasados. */
    private static function maxDate(): string
    {
        return now()->addDay()->toDateTimeString();
    }

    /**
     * Regla `exists` acotada a la granja activa: impide referenciar el galpón,
     * cliente o categoría de OTRA granja.
     */
    private static function inFarm(string $table): Exists
    {
        $farmId = app(ActiveFarmResolver::class)->id();

        return Rule::exists($table, 'id')->where(
            fn ($query) => $query->where('farm_id', $farmId)
        );
    }
}
