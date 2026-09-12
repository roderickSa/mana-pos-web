import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
  type CategoryDto,
} from '@/shared/api/categories';
import { apiErrorMessage } from '@/shared/api/client';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { refreshCategories } from '@/shared/state/categories';
import { showNotice } from '@/shared/state/notices';
import { CategoryIcon, CATEGORY_ICON_KEYS } from '@/shared/ui/CategoryIcon';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import styles from './CategoriesTab.module.css';

// Colores elegibles (tokens --cat-* del theme).
const COLOR_KEYS = ['verde', 'marron', 'azul', 'morado', 'ambar', 'rojo', 'turquesa', 'rosado'];

export const CategoriesTab: Component = () => {
  const [items, { refetch }] = createResource(() => listCategories(true));
  const [creating, setCreating] = createSignal(false);
  const [editing, setEditing] = createSignal<CategoryDto | null>(null);
  const [deleting, setDeleting] = createSignal<CategoryDto | null>(null);

  function done(message: string): void {
    setCreating(false);
    setEditing(null);
    setDeleting(null);
    beepSuccess();
    showNotice(message);
    void refetch();
    refreshCategories();
  }

  async function toggleActive(category: CategoryDto): Promise<void> {
    try {
      await updateCategory(category.slug, { active: !category.active });
      done(
        category.active
          ? `Categoría «${category.name}» desactivada — sus productos siguen visibles`
          : `Categoría «${category.name}» activada`,
      );
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo actualizar la categoría.'));
    }
  }

  // Subir/bajar una posición: manda la lista completa reordenada (atómico).
  async function move(category: CategoryDto, delta: -1 | 1): Promise<void> {
    const list = [...(items() ?? [])];
    const index = list.findIndex((item) => item.slug === category.slug);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    const swapped = list[target];
    if (swapped === undefined) return;
    list[target] = category;
    list[index] = swapped;
    try {
      await reorderCategories(list.map((item) => item.slug));
      void refetch();
      refreshCategories();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo reordenar.'));
    }
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <p class={tabla.vacio} style={{ padding: '0', 'text-align': 'left', flex: '1' }}>
          El orden de esta lista es el orden de las pestañas de Vender. El ícono y el color visten
          los tiles de los productos sin foto.
        </p>
        <button type="button" class={tabla.nuevo} onClick={() => setCreating(true)}>
          + Nueva categoría
        </button>
      </div>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th style={{ width: '110px' }}>Orden</th>
              <th>Nombre</th>
              <th>Estilo</th>
              <th class={tabla.num}>Productos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <For each={items() ?? []}>
              {(category, index) => (
                <tr classList={{ [tabla.inactivo]: !category.active }}>
                  <td>
                    <span class={styles.orden}>
                      <button
                        type="button"
                        aria-label={`Subir ${category.name}`}
                        disabled={index() === 0}
                        onClick={() => void move(category, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${category.name}`}
                        disabled={index() === (items() ?? []).length - 1}
                        onClick={() => void move(category, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                  <td class={tabla.nombre}>{category.name}</td>
                  <td>
                    <span
                      class={styles.estilo}
                      style={{ color: `var(--cat-${category.color ?? 'marron'})` }}
                    >
                      <span class={styles.estiloIcono}>
                        <CategoryIcon category={category.slug} icon={category.icon} />
                      </span>
                    </span>
                  </td>
                  <td class={tabla.num}>{category.productCount ?? 0}</td>
                  <td class={tabla.sub}>{category.active ? 'activa' : 'inactiva'}</td>
                  <td class={tabla.acciones}>
                    <button type="button" onClick={() => setEditing(category)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => void toggleActive(category)}>
                      {category.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      disabled={(items() ?? []).length < 2}
                      onClick={() => setDeleting(category)}
                    >
                      Eliminar…
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={creating()}>
        <CategoryFormModal
          title="Nueva categoría"
          category={null}
          onSave={async (name, icon, color) => {
            const created = await createCategory(name);
            // Mismo formulario que editar: si eligió estilo, se aplica ya.
            if (icon !== null || color !== null) {
              await updateCategory(created.slug, {
                name,
                ...(icon !== null ? { icon } : {}),
                ...(color !== null ? { color } : {}),
              });
            }
            done(`Categoría «${created.name}» creada`);
          }}
          onClose={() => setCreating(false)}
        />
      </Show>

      <Show when={editing()}>
        {(category) => (
          <CategoryFormModal
            title={`Editar «${category().name}»`}
            category={category()}
            onSave={async (name, icon, color) => {
              await updateCategory(category().slug, { name, icon, color });
              done(`Categoría «${name}» actualizada`);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>

      <Show when={deleting()}>
        {(category) => (
          <DeleteCategoryModal
            category={category()}
            others={(items() ?? []).filter((item) => item.slug !== category().slug)}
            onDone={done}
            onClose={() => setDeleting(null)}
          />
        )}
      </Show>
    </section>
  );
};

const CategoryFormModal: Component<{
  title: string;
  category: CategoryDto | null;
  onSave: (name: string, icon: string | null, color: string | null) => Promise<void>;
  onClose: () => void;
}> = (props) => {
  const [name, setName] = createSignal(props.category?.name ?? '');
  const [icon, setIcon] = createSignal<string | null>(props.category?.icon ?? null);
  const [color, setColor] = createSignal<string | null>(props.category?.color ?? null);
  const [error, setError] = createSignal('');

  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving() || name().trim() === '') return;
    setSaving(true);
    try {
      await props.onSave(name().trim(), icon(), color());
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo guardar la categoría.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <div class={forms.form}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Nombre</span>
          <input
            class={forms.input}
            maxLength={60}
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
            autofocus
          />
        </div>

        <div class={forms.campo}>
          <span class={forms.etiqueta}>Ícono (para tiles sin foto)</span>
            <div class={styles.pickerIconos}>
              <For each={[...CATEGORY_ICON_KEYS]}>
                {(key) => (
                  <button
                    type="button"
                    class={styles.opcionIcono}
                    classList={{ [styles.opcionActiva]: icon() === key }}
                    aria-label={`Ícono ${key}`}
                    onClick={() => setIcon(key)}
                  >
                    <CategoryIcon category="" icon={key} />
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class={forms.campo}>
            <span class={forms.etiqueta}>Color (barra del tile)</span>
            <div class={styles.pickerColores}>
              <For each={COLOR_KEYS}>
                {(key) => (
                  <button
                    type="button"
                    class={styles.opcionColor}
                    classList={{ [styles.opcionActiva]: color() === key }}
                    style={{ background: `var(--cat-${key})` }}
                    aria-label={`Color ${key}`}
                    title={key}
                    onClick={() => setColor(key)}
                  />
                )}
              </For>
            </div>
          </div>

        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={saving()} onClick={() => void save()}>
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Eliminar nunca deja productos huérfanos: siempre migran a otra categoría.
const DeleteCategoryModal: Component<{
  category: CategoryDto;
  others: CategoryDto[];
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [target, setTarget] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function confirm(): Promise<void> {
    if (target() === '' || busy()) return;
    setBusy(true);
    try {
      const result = await deleteCategory(props.category.slug, target());
      const targetName = props.others.find((item) => item.slug === target())?.name ?? target();
      props.onDone(
        result.movedProducts === 0
          ? `Categoría «${props.category.name}» eliminada`
          : `Categoría «${props.category.name}» eliminada — ${result.movedProducts} productos pasaron a «${targetName}»`,
      );
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo eliminar la categoría.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal size="sm" title={`Eliminar «${props.category.name}»`} onClose={props.onClose}>
      <div class={forms.form}>
        <p class={forms.nota}>
          {props.category.productCount === 0
            ? 'La categoría no tiene productos.'
            : `Sus ${props.category.productCount} productos pasarán a la categoría que elijas — nada se borra.`}{' '}
          Esta acción no se puede deshacer.
        </p>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="cat-destino">
            Mover los productos a
          </label>
          <select
            id="cat-destino"
            class={forms.input}
            value={target()}
            onChange={(event) => setTarget(event.currentTarget.value)}
          >
            <option value="">— elige una categoría —</option>
            <For each={props.others}>
              {(item) => <option value={item.slug}>{item.name}</option>}
            </For>
          </select>
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={styles.eliminar}
            disabled={target() === '' || busy()}
            onClick={() => void confirm()}
          >
            {busy() ? 'Eliminando…' : 'Sí, eliminar categoría'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
