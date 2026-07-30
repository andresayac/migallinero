<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Registro: crea el usuario Y su granja inicial (1 usuario ↔ 1 granja en MVP).
     * Devuelve token Sanctum + datos de la granja.
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'unique:users,username'],
            'password' => ['required', 'string', 'min:4'],
            'farm_name' => ['required', 'string', 'max:120'],
        ]);

        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'username' => $data['username'],
                'password' => $data['password'],
                'role' => 'admin',
            ]);

            $farm = Farm::create([
                'name' => $data['farm_name'],
                'owner_name' => $user->name,
                'period_lock_days' => 7,
            ]);

            // Asignar el usuario como admin de la granja.
            $farm->users()->attach($user->id, [
                'role' => 'admin',
                'active' => true,
                'joined_at' => now(),
            ]);

            // Crear catálogos por defecto de la granja.
            $this->seedDefaultCatalogs($farm);

            $token = $user->createToken('mobile')->plainTextToken;

            return response()->json([
                'token' => $token,
                'user' => $user,
                'farm' => $farm,
                'boot' => $this->bootData($farm),
            ], 201);
        });
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['Usuario o contraseña incorrectos.'],
            ]);
        }

        $token = $user->createToken('mobile')->plainTextToken;
        $farm = $user->farms()->first();

        return response()->json([
            'token' => $token,
            'user' => $user,
            'farm' => $farm,
            'boot' => $this->bootData($farm),
        ]);
    }

    /**
     * Snapshot completo de los catálogos y configuración de la granja activa.
     * El cliente lo usa al iniciar sesión para sincronizar sus UUIDs locales
     * con los ids numéricos del backend (evita FKs NULL en la sync).
     */
    public function boot(Request $request)
    {
        return response()->json($this->bootData($request->user()->farms()->first()));
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
            'farm' => $request->user()->farms()->first(),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada']);
    }

    /**
     * Snapshot completo de los catálogos y configuración de la granja.
     * Devuelve id + local_uuid para que el cliente pueda mapear/actualizar
     * sus registros locales con los ids reales del backend.
     */
    protected function bootData(Farm $farm): array
    {
        return [
            'farm' => [
                'id' => $farm->id,
                'name' => $farm->name,
                'period_lock_days' => $farm->period_lock_days,
            ],
            'pens' => $farm->pens()->orderBy('sort')->get(['id', 'local_uuid', 'name', 'color', 'active', 'sort'])->toArray(),
            'egg_categories' => $farm->eggCategories()->orderBy('sort')->get([
                'id', 'local_uuid', 'name', 'short', 'sellable', 'is_broken', 'color', 'sort',
            ])->toArray(),
            'presentations' => $farm->presentations()->orderBy('sort')->get([
                'id', 'local_uuid', 'code', 'name', 'units_per_pack', 'sort',
            ])->toArray(),
            'mortality_causes' => $farm->mortalityCauses()->orderBy('sort')->get(['id', 'local_uuid', 'name', 'sort'])->toArray(),
        ];
    }

    /**
     * Catálogos por defecto de Colombia (igual que en el frontend offline).
     * Esto asegura que el cliente y el servidor arranquen con lo mismo.
     */
    private function seedDefaultCatalogs(Farm $farm): void
    {
        $order = 1;
        foreach ([
            ['Jumbo', 'JUM', true, false, '#16a34a'],
            ['EX', 'EX', true, false, '#0ea5e9'],
            ['AA', 'AA', true, false, '#8b5cf6'],
            ['A', 'A', true, false, '#f59e0b'],
            ['B', 'B', true, false, '#ec4899'],
            ['C', 'C', true, false, '#64748b'],
            ['Rotos', 'ROT', false, true, '#dc2626'],
        ] as [$name, $short, $sellable, $broken, $color]) {
            $farm->eggCategories()->create([
                'name' => $name,
                'short' => $short,
                'sellable' => $sellable,
                'is_broken' => $broken,
                'color' => $color,
                'sort' => $order++,
                'active' => true,
            ]);
        }

        $farm->pens()->create([
            'name' => 'Galpón 1',
            'color' => '#16a34a',
            'active' => true,
            'sort' => 1,
        ]);

        $causeOrder = 1;
        foreach ([
            'Enfermedad', 'Accidente', 'Ataque de animal',
            'Calor', 'Frío', 'Causa desconocida', 'Otra causa',
        ] as $cause) {
            $farm->mortalityCauses()->create([
                'name' => $cause,
                'active' => true,
                'sort' => $causeOrder++,
            ]);
        }

        $presOrder = 1;
        foreach ([
            ['unit', 'Unidad', 1],
            ['cubeta', 'Cubeta (30)', 30],
            ['torre', 'Torre (300)', 300],
        ] as [$code, $name, $units]) {
            $farm->presentations()->create([
                'code' => $code,
                'name' => $name,
                'units_per_pack' => $units,
                'sort' => $presOrder++,
                'active' => true,
            ]);
        }
    }
}
