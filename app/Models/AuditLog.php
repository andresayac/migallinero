<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'action', 'entity', 'entity_id', 'before', 'after'])]
class AuditLog extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'before' => 'array',
        'after' => 'array',
        'entity_id' => 'integer',
    ];
}
