<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catálogo global de granjas (cada registro = un tenant).
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('owner_name')->nullable();
            $table->string('phone')->nullable();
            $table->string('country')->default('CO');
            $table->string('timezone')->default('America/Bogota');
            $table->string('locale')->default('es-CO');
            $table->string('currency')->default('COP');
            // Candado de período: días hacia atrás permitidos para registrar.
            $table->unsignedSmallInteger('period_lock_days')->default(7);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        // N:N usuario ↔ granja con rol (preparado para multi-granja futuro).
        Schema::create('farm_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('admin'); // admin | vendedor | operario
            $table->boolean('active')->default(true);
            $table->timestamp('joined_at')->nullable();
            $table->timestamps();
            $table->unique(['farm_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farm_user');
        Schema::dropIfExists('farms');
    }
};
