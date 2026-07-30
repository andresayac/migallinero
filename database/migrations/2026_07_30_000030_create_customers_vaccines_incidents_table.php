<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('address')->nullable();
            $table->string('id_number')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('balance', 14, 0)->default(0); // COP enteros
            $table->boolean('active')->default(true);
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'active']);
        });

        Schema::create('vaccines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('name');
            $table->string('batch')->nullable();
            $table->date('expires_at')->nullable();
            $table->string('dose')->nullable();
            $table->datetime('applied_at');
            $table->datetime('next_at')->nullable();
            $table->foreignId('pen_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('qty_chickens')->default(0);
            $table->string('responsible')->nullable();
            $table->text('observation')->nullable();
            $table->string('photo_path')->nullable();
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'next_at']);
        });

        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->string('type'); // salud, alimentación, agua...
            $table->foreignId('pen_id')->nullable()->constrained()->nullOnDelete();
            $table->text('description');
            $table->string('severity')->default('med'); // low | med | high
            $table->string('status')->default('open'); // open | reviewed | solved
            $table->datetime('solved_at')->nullable();
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incidents');
        Schema::dropIfExists('vaccines');
        Schema::dropIfExists('customers');
    }
};
