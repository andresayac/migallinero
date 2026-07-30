<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['egg_category_id', 'category_name', 'qty'])]
class EggCollectionLine extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = ['qty' => 'integer'];

    public function collection(): BelongsTo
    {
        return $this->belongsTo(EggCollection::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(EggCategory::class, 'egg_category_id');
    }
}
