<?php

/*
|--------------------------------------------------------------------------
| Mensajes de validación en español
|--------------------------------------------------------------------------
|
| Laravel no incluye traducciones al español, así que con APP_LOCALE=es los
| mensajes salían como la clave cruda: un usuario veía "validation.required" o
| "validation.before_or_equal". Y esos textos son visibles: la pantalla de
| Ajustes muestra el motivo por el que un registro no pudo subir al servidor.
|
| Sólo se traducen las reglas que la aplicación usa de verdad.
|
*/

return [
    'array' => 'El campo :attribute debe ser una lista.',
    'before_or_equal' => 'La fecha de :attribute no puede ser posterior a :date.',
    'boolean' => 'El campo :attribute debe ser verdadero o falso.',
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'current_password' => 'La contraseña no es correcta.',
    'date' => 'La fecha de :attribute no es válida.',
    'digits_between' => 'El campo :attribute debe tener entre :min y :max dígitos.',
    'exists' => 'El :attribute seleccionado no existe en tu granja.',
    'in' => 'El valor de :attribute no es válido.',
    'integer' => 'El campo :attribute debe ser un número entero.',
    'max' => [
        'array' => 'El campo :attribute no puede tener más de :max elementos.',
        'file' => 'El archivo :attribute no puede pesar más de :max kilobytes.',
        'numeric' => 'El campo :attribute no puede ser mayor que :max.',
        'string' => 'El campo :attribute no puede tener más de :max caracteres.',
    ],
    'min' => [
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
        'numeric' => 'El campo :attribute debe ser al menos :min.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
    ],
    'numeric' => 'El campo :attribute debe ser un número.',
    'password' => [
        'letters' => 'La contraseña debe contener al menos una letra.',
        'mixed' => 'La contraseña debe contener mayúsculas y minúsculas.',
        'numbers' => 'La contraseña debe contener al menos un número.',
        'symbols' => 'La contraseña debe contener al menos un símbolo.',
        'uncompromised' => 'Esta contraseña apareció en una filtración de datos. Elige otra.',
    ],
    'regex' => 'El formato de :attribute no es válido.',
    'required' => 'El campo :attribute es obligatorio.',
    'required_with' => 'El campo :attribute es obligatorio cuando hay :values.',
    'size' => [
        'numeric' => 'El campo :attribute debe ser :size.',
        'string' => 'El campo :attribute debe tener :size caracteres.',
    ],
    'string' => 'El campo :attribute debe ser texto.',
    'timezone' => 'La zona horaria de :attribute no es válida.',
    'unique' => 'Ese :attribute ya está en uso.',

    /*
    |--------------------------------------------------------------------------
    | Nombres de campo
    |--------------------------------------------------------------------------
    |
    | Para que el mensaje diga "El campo cantidad es obligatorio" en vez de
    | "El campo qty es obligatorio".
    |
    */

    'attributes' => [
        'amount' => 'monto',
        'applied_at' => 'aplicación',
        'bags' => 'bultos',
        'balance' => 'saldo',
        'collection_at' => 'recolección',
        'currency' => 'moneda',
        'current_password' => 'contraseña actual',
        'customer_id' => 'cliente',
        'description' => 'descripción',
        'discount' => 'descuento',
        'egg_category_id' => 'categoría de huevo',
        'entry_mode' => 'modo de registro',
        'expires_at' => 'vencimiento',
        'farm_name' => 'nombre de la granja',
        'feed_type_id' => 'tipo de alimento',
        'kg_per_bag' => 'kilos por bulto',
        'lines' => 'líneas',
        'lines.*.qty' => 'cantidad',
        'locale' => 'idioma',
        'manual_reason' => 'motivo',
        'movement_at' => 'movimiento',
        'name' => 'nombre',
        'next_at' => 'próxima fecha',
        'observation' => 'observación',
        'paid' => 'pagado',
        'paid_at' => 'pago',
        'password' => 'contraseña',
        'pen_id' => 'galpón',
        'period_lock_days' => 'días del candado',
        'phone' => 'teléfono',
        'pin' => 'PIN',
        'presentation_id' => 'presentación',
        'purchased_at' => 'compra',
        'qty' => 'cantidad',
        'qty_chickens' => 'cantidad de gallinas',
        'qty_packs' => 'cantidad',
        'qty_units' => 'unidades',
        'recorded_at' => 'registro',
        'sale_id' => 'venta',
        'severity' => 'importancia',
        'shift' => 'turno',
        'sold_at' => 'venta',
        'solved_at' => 'solución',
        'status' => 'estado',
        'subtotal' => 'subtotal',
        'timezone' => 'zona horaria',
        'total' => 'total',
        'total_bags' => 'total de bultos',
        'total_cost' => 'costo total',
        'total_qty' => 'cantidad total',
        'type' => 'tipo',
        'unit_cost' => 'costo unitario',
        'unit_price' => 'precio unitario',
        'units_per_pack' => 'unidades por paquete',
        'username' => 'usuario',
    ],
];
