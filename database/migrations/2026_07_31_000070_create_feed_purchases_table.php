<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Compra de alimento (bultos/sacos). El granjero compra 1, 2, X bultos
        // a la semana/mes. Cada compra tiene fecha, proveedor, bultos y costo total.
        Schema::create('feed_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->datetime('purchased_at');
            $table->string('supplier')->nullable();       // proveedor/tienda
            $table->string('observation')->nullable();
            $table->unsignedInteger('total_bags')->default(0);   // total de bultos
            $table->unsignedInteger('total_qty')->default(0);    // total kg (bultos × kg por bulto)
            $table->unsignedInteger('total_cost')->default(0);   // costo total COP
            $table->string('entry_mode')->default('auto');
            $table->string('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'purchased_at']);
        });

        // Líneas de la compra (un tipo de alimento por línea).
        Schema::create('feed_purchase_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('feed_purchase_id')->constrained()->cascadeOnDelete();
            $table->foreignId('feed_type_id')->nullable()->constrained('feed_types')->nullOnDelete();
            $table->string('feed_type_name')->nullable(); // snapshot histórico
            $table->unsignedInteger('bags')->default(0);          // bultos comprados
            $table->decimal('kg_per_bag', 8, 2)->default(0);       // kg que trae cada bulto (40, 50…)
            $table->unsignedInteger('unit_cost')->default(0);     // costo por bulto en COP
            $table->unsignedInteger('subtotal')->default(0);      // bags × unit_cost
            $table->timestamps();

            $table->index(['farm_id', 'feed_purchase_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feed_purchase_lines');
        Schema::dropIfExists('feed_purchases');
    }
};