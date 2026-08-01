<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use App\Models\User;
use App\Tenancy\ActiveFarmResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Cuántos tokens activos se conservan por usuario (uno por dispositivo). */
    private const MAX_TOKENS = 5;

    private const TOKEN_DAYS = 30;

    /** Monedas admitidas por el asistente guiado. */
    private const CURRENCIES = ['COP', 'MXN', 'PEN', 'ARS', 'CLP', 'USD', 'EUR', 'BRL', 'BOB', 'GTQ'];

    public function __construct(private ActiveFarmResolver $resolver) {}

    /**
     * Registro: crea el usuario Y su granja inicial (1 usuario ↔ 1 granja en MVP).
     * Devuelve token Sanctum + datos de la granja.
     *
     * Acepta la configuración del asistente guiado y, opcionalmente, los
     * catálogos que el cliente ya creó localmente (con sus `local_uuid`). Si
     * vienen, se siembran esos en lugar de los de por defecto: antes el
     * servidor sembraba siempre los catálogos colombianos y quedaban duplicados
     * junto a los personalizados del asistente.
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[a-zA-Z0-9._-]+$/', 'unique:users,username'],
            'password' => ['required', 'string', Password::min(8)],
            'farm_name' => ['required', 'string', 'max:120'],
            // Configuración opcional del asistente guiado:
            'currency' => ['sometimes', 'string', 'size:3', Rule::in(self::CURRENCIES)],
            'country' => ['sometimes', 'string', 'size:2', 'alpha'],
            'timezone' => ['sometimes', 'string', 'max:64', 'timezone'],
            'locale' => ['sometimes', 'string', 'max:12', 'regex:/^[a-z]{2}(-[A-Z]{2})?$/'],
            'period_lock_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            // Catálogos ya creados en el dispositivo (asistente offline):
            'catalogs' => ['sometimes', 'array'],
            'catalogs.pens' => ['sometimes', 'array', 'max:100'],
            'catalogs.egg_categories' => ['sometimes', 'array', 'max:100'],
            'catalogs.mortality_causes' => ['sometimes', 'array', 'max:100'],
            'catalogs.presentations' => ['sometimes', 'array', 'max:100'],
            'catalogs.feed_types' => ['sometimes', 'array', 'max:100'],
        ]);

        $result = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'username' => $data['username'],
                'password' => $data['password'],
                'role' => 'admin',
            ]);

            $farm = Farm::create([
                'name' => $data['farm_name'],
                'owner_name' => $user->name,
                'period_lock_days' => $data['period_lock_days'] ?? 7,
                'currency' => $data['currency'] ?? 'COP',
                'country' => strtoupper($data['country'] ?? 'CO'),
                'timezone' => $data['timezone'] ?? 'America/Bogota',
                'locale' => $data['locale'] ?? 'es-CO',
                'phone' => $data['phone'] ?? null,
            ]);

            $farm->users()->attach($user->id, [
                'role' => 'admin',
                'active' => true,
                'joined_at' => now(),
            ]);

            // El resolver debe estar activo para que BelongsToFarm rellene
            // farm_id al sembrar los catálogos.
            $this->resolver->withFarm($farm->id, fn () => $this->seedCatalogs($farm, $data['catalogs'] ?? null));

            return [$user, $farm];
        });

        [$user, $farm] = $result;

        return $this->sessionResponse($user, $farm, 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:40'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $user = User::where('username', $data['username'])->first();

        // Comprobamos el hash incluso cuando el usuario no existe para que el
        // tiempo de respuesta no revele qué nombres están registrados.
        $hash = $user?->password ?? Hash::make('placeholder-para-tiempo-constante');
        $passwordOk = Hash::check($data['password'], $hash);

        if (! $user || ! $passwordOk || ! $user->active) {
            throw ValidationException::withMessages([
                'username' => ['Usuario o contraseña incorrectos.'],
            ]);
        }

        $farm = $this->firstFarmFor($user);

        if (! $farm) {
            throw ValidationException::withMessages([
                'username' => ['Tu usuario no tiene ninguna granja asignada.'],
            ]);
        }

        return $this->sessionResponse($user, $farm);
    }

    /**
     * Actualiza la configuración de la granja ACTIVA (no la primera del
     * usuario, que es lo que hacía antes y rompería el multi-granja).
     */
    public function updateFarm(Request $request)
    {
        $farm = $this->activeFarm();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'owner_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'country' => ['sometimes', 'string', 'size:2', 'alpha'],
            'timezone' => ['sometimes', 'string', 'max:64', 'timezone'],
            'locale' => ['sometimes', 'string', 'max:12', 'regex:/^[a-z]{2}(-[A-Z]{2})?$/'],
            'currency' => ['sometimes', 'string', 'size:3', Rule::in(self::CURRENCIES)],
            'period_lock_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
        ]);

        if (isset($data['country'])) {
            $data['country'] = strtoupper($data['country']);
        }

        $farm->fill($data)->save();

        return response()->json([
            'farm' => $this->farmPayload($farm),
            'boot' => $this->bootData($farm),
        ]);
    }

    public function boot(Request $request)
    {
        return response()->json($this->bootData($this->activeFarm()));
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
            'farm' => $this->farmPayload($this->activeFarm()),
            'role' => $this->resolver->role(),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Sesión cerrada']);
    }

    /**
     * Cambio de contraseña autenticado. No hay recuperación por email (los
     * usuarios no tienen correo), así que esta es la única vía y exige conocer
     * la contraseña actual.
     */
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['La contraseña actual no es correcta.'],
            ]);
        }

        $user->update(['password' => $data['password']]);

        // Cambiar la contraseña invalida el resto de sesiones.
        $current = $user->currentAccessToken();
        $user->tokens()->when($current, fn ($q) => $q->where('id', '!=', $current->id))->delete();

        return response()->json(['message' => 'Contraseña actualizada']);
    }

    /** Define el PIN de autorización del admin (para el candado de período). */
    public function setPin(Request $request)
    {
        $data = $request->validate([
            'pin' => ['required', 'string', 'digits_between:4,8'],
            'current_password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['La contraseña actual no es correcta.'],
            ]);
        }

        // El PIN se guarda hasheado: el cast 'hashed' del modelo se encarga.
        $user->update(['pin' => $data['pin']]);

        return response()->json(['message' => 'PIN actualizado']);
    }

    /**
     * Verifica el PIN del admin. Lo usa el cliente antes de permitir registrar
     * fuera de la ventana del candado. Antes el PIN no se comprobaba nunca y el
     * candado era puramente decorativo.
     */
    public function verifyPin(Request $request)
    {
        $data = $request->validate([
            'pin' => ['required', 'string', 'max:16'],
        ]);

        $user = $request->user();

        if (! $this->resolver->isAdmin()) {
            return response()->json(['valid' => false, 'message' => 'Sólo un administrador puede autorizar.'], 403);
        }

        if (! $user->pin) {
            return response()->json([
                'valid' => false,
                'message' => 'No has configurado un PIN de administrador en Ajustes.',
            ], 422);
        }

        if (! Hash::check($data['pin'], $user->pin)) {
            return response()->json(['valid' => false, 'message' => 'PIN incorrecto.'], 422);
        }

        return response()->json(['valid' => true]);
    }

    /**
     * Respuesta común de login/registro: token + usuario + granja + catálogos.
     */
    private function sessionResponse(User $user, Farm $farm, int $status = 200)
    {
        // Un dispositivo nuevo no debe acumular tokens indefinidamente.
        $this->pruneTokens($user);

        $token = $user->createToken('mobile', ['*'], now()->addDays(self::TOKEN_DAYS))->plainTextToken;

        $role = DB::table('farm_user')
            ->where('farm_id', $farm->id)
            ->where('user_id', $user->id)
            ->value('role');

        return response()->json([
            'token' => $token,
            'user' => $user,
            'role' => $role,
            'farm' => $this->farmPayload($farm),
            // El boot necesita el contexto de granja activa para el global scope.
            'boot' => $this->resolver->withFarm($farm->id, fn () => $this->bootData($farm), $role),
        ], $status);
    }

    private function pruneTokens(User $user): void
    {
        $ids = $user->tokens()
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->pluck('id')
            ->slice(self::MAX_TOKENS - 1);

        if ($ids->isNotEmpty()) {
            $user->tokens()->whereIn('id', $ids)->delete();
        }
    }

    private function activeFarm(): Farm
    {
        $id = $this->resolver->id();

        // `active.farm` garantiza que exista; esto sólo blinda el tipo para que
        // un caso raro devuelva 403 en vez de un TypeError 500 (que es lo que
        // pasaba cuando el usuario no tenía granja).
        abort_if($id === null, 403, 'No tienes ninguna granja activa.');

        return Farm::findOrFail($id);
    }

    private function firstFarmFor(User $user): ?Farm
    {
        return $user->farms()->wherePivot('active', true)->orderBy('farms.id')->first();
    }

    /** @return array<string, mixed> */
    private function farmPayload(Farm $farm): array
    {
        return [
            'id' => $farm->id,
            'name' => $farm->name,
            'owner_name' => $farm->owner_name,
            'phone' => $farm->phone,
            'country' => $farm->country,
            'timezone' => $farm->timezone,
            'locale' => $farm->locale,
            'currency' => $farm->currency,
            'period_lock_days' => $farm->period_lock_days,
        ];
    }

    /**
     * Snapshot de los catálogos y configuración de la granja.
     * Devuelve id + local_uuid para que el cliente empareje sus registros
     * locales con los ids reales del backend.
     *
     * @return array<string, mixed>
     */
    protected function bootData(Farm $farm): array
    {
        return [
            'farm' => $this->farmPayload($farm),
            'pens' => $farm->pens()->orderBy('sort')->get(['id', 'local_uuid', 'name', 'color', 'active', 'sort'])->toArray(),
            'egg_categories' => $farm->eggCategories()->orderBy('sort')->get([
                'id', 'local_uuid', 'name', 'short', 'sellable', 'is_broken', 'color', 'active', 'sort',
            ])->toArray(),
            'presentations' => $farm->presentations()->orderBy('sort')->get([
                'id', 'local_uuid', 'code', 'name', 'units_per_pack', 'active', 'sort',
            ])->toArray(),
            'mortality_causes' => $farm->mortalityCauses()->orderBy('sort')->get(['id', 'local_uuid', 'name', 'active', 'sort'])->toArray(),
            'feed_types' => $farm->feedTypes()->orderBy('sort')->get(['id', 'local_uuid', 'name', 'unit', 'active', 'sort'])->toArray(),
        ];
    }

    /**
     * Siembra los catálogos de la granja.
     *
     * Si el cliente manda los suyos (asistente guiado), se usan tal cual con su
     * `local_uuid`, de modo que el emparejamiento posterior sea exacto y no por
     * nombre. Si no, se usan los valores por defecto de Colombia.
     *
     * @param  array<string, array<int, array<string, mixed>>>|null  $catalogs
     */
    private function seedCatalogs(Farm $farm, ?array $catalogs): void
    {
        $pens = $this->pick($catalogs, 'pens', [
            ['name' => 'Galpón 1', 'color' => '#16a34a'],
        ]);
        foreach ($pens as $i => $pen) {
            $farm->pens()->create([
                'local_uuid' => $this->uuidOf($pen),
                'name' => $this->str($pen, 'name', 'Galpón '.($i + 1)),
                'color' => $this->color($pen),
                'active' => true,
                'sort' => $i + 1,
            ]);
        }

        $categories = $this->pick($catalogs, 'egg_categories', [
            ['name' => 'Jumbo', 'short' => 'JUM', 'sellable' => true, 'is_broken' => false, 'color' => '#16a34a'],
            ['name' => 'EX', 'short' => 'EX', 'sellable' => true, 'is_broken' => false, 'color' => '#0ea5e9'],
            ['name' => 'AA', 'short' => 'AA', 'sellable' => true, 'is_broken' => false, 'color' => '#8b5cf6'],
            ['name' => 'A', 'short' => 'A', 'sellable' => true, 'is_broken' => false, 'color' => '#f59e0b'],
            ['name' => 'B', 'short' => 'B', 'sellable' => true, 'is_broken' => false, 'color' => '#ec4899'],
            ['name' => 'C', 'short' => 'C', 'sellable' => true, 'is_broken' => false, 'color' => '#64748b'],
            ['name' => 'Rotos', 'short' => 'ROT', 'sellable' => false, 'is_broken' => true, 'color' => '#dc2626'],
        ]);
        foreach ($categories as $i => $cat) {
            $farm->eggCategories()->create([
                'local_uuid' => $this->uuidOf($cat),
                'name' => $this->str($cat, 'name', 'Categoría '.($i + 1)),
                'short' => $this->str($cat, 'short', null, 12),
                'sellable' => (bool) ($cat['sellable'] ?? true),
                'is_broken' => (bool) ($cat['is_broken'] ?? $cat['isBroken'] ?? false),
                'color' => $this->color($cat),
                'active' => true,
                'sort' => $i + 1,
            ]);
        }

        $causes = $this->pick($catalogs, 'mortality_causes', array_map(
            fn ($name) => ['name' => $name],
            ['Enfermedad', 'Accidente', 'Ataque de animal', 'Calor', 'Frío', 'Causa desconocida', 'Otra causa']
        ));
        foreach ($causes as $i => $cause) {
            $farm->mortalityCauses()->create([
                'local_uuid' => $this->uuidOf($cause),
                'name' => $this->str($cause, 'name', 'Causa '.($i + 1)),
                'active' => true,
                'sort' => $i + 1,
            ]);
        }

        $presentations = $this->pick($catalogs, 'presentations', [
            ['code' => 'unit', 'name' => 'Unidad', 'units_per_pack' => 1],
            ['code' => 'cubeta', 'name' => 'Cubeta (30)', 'units_per_pack' => 30],
            ['code' => 'torre', 'name' => 'Torre (300)', 'units_per_pack' => 300],
        ]);
        foreach ($presentations as $i => $pres) {
            $units = (int) ($pres['units_per_pack'] ?? $pres['unitsPerPack'] ?? 1);
            $farm->presentations()->create([
                'local_uuid' => $this->uuidOf($pres),
                'code' => in_array($pres['code'] ?? null, ['unit', 'cubeta', 'torre', 'custom'], true) ? $pres['code'] : 'custom',
                'name' => $this->str($pres, 'name', 'Presentación '.($i + 1)),
                'units_per_pack' => max(1, min($units, 100000)),
                'active' => true,
                'sort' => $i + 1,
            ]);
        }

        $feedTypes = $this->pick($catalogs, 'feed_types', array_map(
            fn ($name) => ['name' => $name, 'unit' => 'kg'],
            ['Concentrado de inicial', 'Concentrado de levante', 'Concentrado de postura', 'Purina', 'Maíz']
        ));
        foreach ($feedTypes as $i => $feed) {
            $farm->feedTypes()->create([
                'local_uuid' => $this->uuidOf($feed),
                'name' => $this->str($feed, 'name', 'Alimento '.($i + 1)),
                'unit' => $this->str($feed, 'unit', 'kg', 16),
                'active' => true,
                'sort' => $i + 1,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>|null  $catalogs
     * @param  array<int, array<string, mixed>>  $default
     * @return array<int, array<string, mixed>>
     */
    private function pick(?array $catalogs, string $key, array $default): array
    {
        $items = $catalogs[$key] ?? null;

        if (! is_array($items) || $items === []) {
            return $default;
        }

        return array_values(array_filter($items, 'is_array'));
    }

    /** @param array<string, mixed> $item */
    private function uuidOf(array $item): ?string
    {
        $uuid = $item['local_uuid'] ?? $item['localUuid'] ?? null;

        return is_string($uuid) && $uuid !== '' ? mb_substr($uuid, 0, 64) : (string) Str::uuid();
    }

    /** @param array<string, mixed> $item */
    private function str(array $item, string $key, ?string $default, int $max = 120): ?string
    {
        $value = $item[$key] ?? null;

        if (! is_string($value) || trim($value) === '') {
            return $default;
        }

        return mb_substr(trim($value), 0, $max);
    }

    /** @param array<string, mixed> $item */
    private function color(array $item): string
    {
        $color = $item['color'] ?? null;

        return is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color)
            ? $color
            : '#16a34a';
    }
}
