<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'customer_id', 'sold_at', 'total', 'discount', 'paid', 'balance',
    'status', 'payment_method', 'promised_payment_at', 'observation',
    'local_uuid', 'entry_mode', 'manual_reason',
])]
class Sale extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'sold_at' => 'datetime',
        'promised_payment_at' => 'datetime',
        'total' => 'integer',
        'discount' => 'integer',
        'paid' => 'integer',
        'balance' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SaleLine::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
