<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catálogos configurables POR GRANJA.
 * Todos tienen farm_id + local_uuid (deduplicación offline) + entryMode (auditoría).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');
            $table->string('color')->default('#16a34a');
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('sort')->default(1);
            $table->string('entry_mode')->default('auto'); // auto | manual
            $table->text('manual_reason')->nullable();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'active']);
        });

        Schema::create('egg_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');
            $table->string('short')->nullable();
            $table->boolean('sellable')->default(true);
            $table->boolean('is_broken')->default(false);
            $table->string('color')->default('#16a34a');
            $table->unsignedSmallInteger('sort')->default(1);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'active']);
        });

        Schema::create('presentations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('code'); // unit | cubeta | torre | custom
            $table->string('name');
            $table->unsignedInteger('units_per_pack'); // 1, 30, 300
            $table->unsignedSmallInteger('sort')->default(1);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
        });

        Schema::create('mortality_causes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('sort')->default(1);
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mortality_causes');
        Schema::dropIfExists('presentations');
        Schema::dropIfExists('egg_categories');
        Schema::dropIfExists('pens');
    }
};
