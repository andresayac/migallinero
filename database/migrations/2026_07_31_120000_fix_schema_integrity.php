<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Correcciones de esquema encontradas en la auditoría.
 *
 *  1. `payments.sale_id` era NOT NULL, pero la app permite registrar un abono
 *     contra el saldo global del cliente sin venta concreta: el INSERT fallaba.
 *  2. `payments.voided_at`: al anular una venta hay que anular sus pagos, o
 *     siguen contando como ingreso en los reportes.
 *  3. Las columnas de dinero y cantidad de alimento eran `unsignedInteger`, así
 *     que no admitían ajustes negativos ni cantidades fraccionarias (los kg de
 *     un bulto son 40.5, y `qty` en las líneas ya era decimal(10,2)).
 *  4. Índices que faltaban para las consultas del dashboard y de la sync
 *     incremental (`updated_at`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('sale_id')->nullable()->change();
        });

        if (! Schema::hasColumn('payments', 'voided_at')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->timestamp('voided_at')->nullable()->after('observation');
                $table->index(['farm_id', 'voided_at']);
            });
        }

        Schema::table('feed_records', function (Blueprint $table) {
            // total_qty en kg admite decimales; total_cost admite correcciones.
            $table->decimal('total_qty', 12, 2)->default(0)->change();
            $table->bigInteger('total_cost')->default(0)->change();
        });

        Schema::table('feed_record_lines', function (Blueprint $table) {
            $table->bigInteger('unit_cost')->default(0)->change();
            $table->bigInteger('subtotal')->default(0)->change();
        });

        Schema::table('feed_purchases', function (Blueprint $table) {
            $table->decimal('total_qty', 12, 2)->default(0)->change();
            $table->bigInteger('total_cost')->default(0)->change();
        });

        Schema::table('feed_purchase_lines', function (Blueprint $table) {
            $table->bigInteger('unit_cost')->default(0)->change();
            $table->bigInteger('subtotal')->default(0)->change();
        });

        // Sincronización incremental: `?since=` filtra por updated_at.
        foreach ([
            'pens', 'egg_categories', 'presentations', 'mortality_causes', 'feed_types',
            'customers', 'egg_collections', 'chicken_movements', 'vaccines', 'incidents',
            'sales', 'payments', 'feed_records', 'feed_purchases',
        ] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $table->index(['farm_id', 'updated_at'], "{$tableName}_farm_updated_idx");
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'pens', 'egg_categories', 'presentations', 'mortality_causes', 'feed_types',
            'customers', 'egg_collections', 'chicken_movements', 'vaccines', 'incidents',
            'sales', 'payments', 'feed_records', 'feed_purchases',
        ] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $table->dropIndex("{$tableName}_farm_updated_idx");
            });
        }

        Schema::table('feed_purchase_lines', function (Blueprint $table) {
            $table->unsignedInteger('unit_cost')->default(0)->change();
            $table->unsignedInteger('subtotal')->default(0)->change();
        });

        Schema::table('feed_purchases', function (Blueprint $table) {
            $table->unsignedInteger('total_qty')->default(0)->change();
            $table->unsignedInteger('total_cost')->default(0)->change();
        });

        Schema::table('feed_record_lines', function (Blueprint $table) {
            $table->unsignedInteger('unit_cost')->default(0)->change();
            $table->unsignedInteger('subtotal')->default(0)->change();
        });

        Schema::table('feed_records', function (Blueprint $table) {
            $table->unsignedInteger('total_qty')->default(0)->change();
            $table->unsignedInteger('total_cost')->default(0)->change();
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['farm_id', 'voided_at']);
            $table->dropColumn('voided_at');
        });
    }
};
