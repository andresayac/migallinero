<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'sale_id', 'customer_id', 'amount', 'method', 'paid_at', 'observation',
    'local_uuid', 'entry_mode', 'manual_reason',
])]
class Payment extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'amount' => 'integer',
        'paid_at' => 'datetime',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
