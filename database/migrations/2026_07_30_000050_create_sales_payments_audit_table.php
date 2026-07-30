<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->datetime('sold_at');
            $table->decimal('total', 14, 0)->default(0); // COP enteros
            $table->decimal('discount', 14, 0)->default(0);
            $table->decimal('paid', 14, 0)->default(0);
            $table->decimal('balance', 14, 0)->default(0); // total - discount - paid
            $table->string('status')->default('pending'); // paid | partial | pending | void
            $table->string('payment_method')->nullable();
            $table->datetime('promised_payment_at')->nullable();
            $table->text('observation')->nullable();
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'status', 'sold_at']);
        });

        Schema::create('sale_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('egg_category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('presentation_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('qty_packs', 10, 2)->default(0);
            $table->unsignedInteger('qty_units')->default(0);
            $table->decimal('unit_price', 14, 0)->default(0);
            $table->decimal('subtotal', 14, 0)->default(0);
            $table->timestamps();
            $table->index(['farm_id', 'sale_id']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('local_uuid')->nullable();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 14, 0);
            $table->string('method')->nullable();
            $table->datetime('paid_at');
            $table->text('observation')->nullable();
            $table->string('entry_mode')->default('auto');
            $table->text('manual_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['farm_id', 'local_uuid']);
            $table->index(['farm_id', 'paid_at']);
        });

        // Auditoría de cambios relevantes (correcciones, anulaciones, ajustes).
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action'); // create | update | delete | void | adjust
            $table->string('entity'); // sale, egg_collection...
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->timestamps();
            $table->index(['farm_id', 'entity', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sale_lines');
        Schema::dropIfExists('sales');
    }
};
