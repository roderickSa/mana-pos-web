import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { createCategory, listCategories, updateCategory, type CategoryDto } from '@/shared/api/categories';
import { apiErrorMessage } from '@/shared/api/client';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { refreshCategories } from '@/shared/state/categories';
import { showNotice } from '@/shared/state/notices';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

export const CategoriesTab: Component = () => {
  const [items, { refetch }] = createResource(() => listCategories(true));
  const [creating, setCreating] = createSignal(false);
  const [renaming, setRenaming] = createSignal<CategoryDto | null>(null);

  function done(message: string): void {
    setCreating(false);
    setRenaming(null);
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

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <p class={tabla.vacio} style={{ padding: '0', 'text-align': 'left', flex: '1' }}>
          Las categorías organizan las pestañas de Vender y el alta de productos. Desactivar una no
          borra sus productos.
        </p>
        <button type="button" class={tabla.nuevo} onClick={() => setCreating(true)}>
          + Nueva categoría
        </button>
      </div>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th class={tabla.num}>Productos</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={items() ?? []}>
              {(category) => (
                <tr classList={{ [tabla.inactivo]: !category.active }}>
                  <td class={tabla.nombre}>{category.name}</td>
                  <td class={tabla.num}>{category.productCount ?? 0}</td>
                  <td class={tabla.sub}>{category.active ? 'activa' : 'inactiva'}</td>
                  <td class={tabla.acciones}>
                    <button type="button" onClick={() => setRenaming(category)}>
                      Renombrar
                    </button>
                    <button type="button" onClick={() => void toggleActive(category)}>
                      {category.active ? 'Desactivar' : 'Activar'}
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
          initialName=""
          onSave={async (name) => {
            const created = await createCategory(name);
            done(`Categoría «${created.name}» creada`);
          }}
          onClose={() => setCreating(false)}
        />
      </Show>

      <Show when={renaming()}>
        {(category) => (
          <CategoryFormModal
            title={`Renombrar «${category().name}»`}
            initialName={category().name}
            onSave={async (name) => {
              await updateCategory(category().slug, { name });
              done(`Categoría renombrada a «${name}»`);
            }}
            onClose={() => setRenaming(null)}
          />
        )}
      </Show>
    </section>
  );
};

const CategoryFormModal: Component<{
  title: string;
  initialName: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}> = (props) => {
  const [name, setName] = createSignal(props.initialName);
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    if (name().trim() === '') return;
    try {
      await props.onSave(name().trim());
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo guardar la categoría.'));
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
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={() => void save()}>
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
};
