<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catálogo de tipos de alimento (por granja).
        Schema::create('feed_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');               // Ej: Concentrado, Purina, Maíz
            $table->string('unit')->default('kg'); // kg, libra, bulto, saco
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();

            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'active']);
        });

        // Registro de consumo de alimento (tanda/entrega).
        Schema::create('feed_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->foreignId('pen_id')->nullable()->constrained('pens')->nullOnDelete();
            $table->datetime('recorded_at');
            $table->string('shift')->default('morning'); // morning | afternoon
            $table->string('observation')->nullable();
            $table->unsignedInteger('total_qty')->default(0);   // suma de cantidades (desnormalizado)
            $table->unsignedInteger('total_cost')->default(0);  // suma de costos (COP enteros)
            $table->string('entry_mode')->default('auto');
            $table->string('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'recorded_at']);
        });

        // Líneas del registro de alimento (un tipo de alimento por línea).
        Schema::create('feed_record_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('feed_record_id')->constrained()->cascadeOnDelete();
            $table->foreignId('feed_type_id')->nullable()->constrained('feed_types')->nullOnDelete();
            $table->string('feed_type_name')->nullable(); // snapshot histórico
            $table->decimal('qty', 10, 2)->default(0);    // cantidad consumida (kg, libras…)
            $table->unsignedInteger('unit_cost')->default(0); // costo por unidad en COP
            $table->unsignedInteger('subtotal')->default(0);  // qty × unit_cost
            $table->timestamps();

            $table->index(['farm_id', 'feed_record_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feed_record_lines');
        Schema::dropIfExists('feed_records');
        Schema::dropIfExists('feed_types');
    }
};
