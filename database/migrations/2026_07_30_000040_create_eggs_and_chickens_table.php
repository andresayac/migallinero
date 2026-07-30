<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tandas de recolección de huevos (varias al día).
        Schema::create('egg_collections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->foreignId('pen_id')->nullable()->constrained()->nullOnDelete();
            $table->datetime('collection_at');
            $table->text('observation')->nullable();
            $table->unsignedInteger('total')->default(0);
            $table->string('entry_mode')->default('auto'); // auto | manual
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'collection_at']);
        });

        Schema::create('egg_collection_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('egg_collection_id')->constrained()->cascadeOnDelete();
            $table->foreignId('egg_category_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('qty');
            // Guardamos el nombre de la categoría al momento del registro para
            // no perder historial si la renombran o eliminan después.
            $table->string('category_name')->nullable();
            $table->timestamps();
            $table->index(['farm_id', 'egg_collection_id']);
        });

        // Movimientos de gallinas: buy/birth/death/sale/revoke/transfer/adjust.
        Schema::create('chicken_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->foreignId('pen_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // buy|birth|death|sale|revoke|transfer|adjust
            $table->integer('qty');
            $table->string('reason')->nullable();
            $table->text('observation')->nullable();
            $table->string('photo_path')->nullable();
            $table->datetime('movement_at'); // fecha operativa (puede ser manual)
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'movement_at', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chicken_movements');
        Schema::dropIfExists('egg_collection_lines');
        Schema::dropIfExists('egg_collections');
    }
};
