<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'name', 'phone', 'address', 'id_number', 'notes', 'balance',
    'active', 'local_uuid', 'entry_mode', 'manual_reason',
])]
class Customer extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'balance' => 'integer',
        'active' => 'boolean',
    ];

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
