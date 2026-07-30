<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['code', 'name', 'units_per_pack', 'sort', 'active', 'local_uuid'])]
class Presentation extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'units_per_pack' => 'integer',
        'sort' => 'integer',
        'active' => 'boolean',
    ];
}
