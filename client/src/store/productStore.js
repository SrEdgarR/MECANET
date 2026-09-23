import { create } from 'zustand';
import { getProducts } from '../services/api';

const defaultPagination = {
  page: 1,
  limit: 50,
  total: 0,
  pages: 0,
  hasNextPage: false,
  hasPrevPage: false
};

export const useProductStore = create((set, get) => ({
  products: [],
  pagination: defaultPagination,
  lastFetched: null,
  lastQueryKey: null,
  isLoading: false,
  error: null,

  // Duracion del cache en milisegundos (5 minutos)
  CACHE_DURATION: 5 * 60 * 1000,

  fetchProducts: async (options = {}, force = false) => {
    let queryOptions = options;
    let shouldForce = force;

    // Compatibilidad hacia atras: fetchProducts(true)
    if (typeof options === 'boolean') {
      shouldForce = options;
      queryOptions = {};
    }

    const normalizedParams = {
      page: queryOptions.page ?? 1,
      limit: queryOptions.limit ?? 50,
      search: queryOptions.search || undefined,
      category: queryOptions.category || undefined,
      brand: queryOptions.brand || undefined,
      supplier: queryOptions.supplier || undefined,
      lowStock: queryOptions.lowStock || undefined,
      outOfStock: queryOptions.outOfStock || undefined,
      includeArchived: queryOptions.includeArchived || undefined,
      sortBy: queryOptions.sortBy || undefined,
      sortOrder: queryOptions.sortOrder || undefined
    };

    const queryKey = JSON.stringify(normalizedParams);

    const {
      products,
      pagination,
      lastFetched,
      lastQueryKey,
      CACHE_DURATION,
      isLoading
    } = get();
    const now = Date.now();

    // Cache hit para la misma consulta
    if (
      !shouldForce &&
      products.length > 0 &&
      lastFetched &&
      lastQueryKey === queryKey &&
      (now - lastFetched < CACHE_DURATION)
    ) {
      return { products, pagination };
    }

    // Evitar doble peticion simultanea para la misma consulta
    if (isLoading && lastQueryKey === queryKey) {
      return { products, pagination };
    }

    set({ isLoading: true, error: null, lastQueryKey: queryKey });

    try {
      const response = await getProducts(normalizedParams);
      const productsData = Array.isArray(response.data?.products)
        ? response.data.products
        : Array.isArray(response.data)
        ? response.data
        : [];

      if (get().lastQueryKey !== queryKey) {
        const { products: currentProducts, pagination: currentPagination } = get();
        return { products: currentProducts, pagination: currentPagination };
      }
      const paginationData = response.data?.pagination || {
        page: normalizedParams.page,
        limit: normalizedParams.limit,
        total: productsData.length,
        pages: productsData.length > 0 ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false
      };

      set({
        products: productsData,
        pagination: paginationData,
        lastFetched: Date.now(),
        lastQueryKey: queryKey,
        isLoading: false
      });

      return { products: productsData, pagination: paginationData };
    } catch (error) {
      if (get().lastQueryKey !== queryKey) {
        const { products: currentProducts, pagination: currentPagination } = get();
        return { products: currentProducts, pagination: currentPagination };
      }
      const emptyPagination = {
        page: normalizedParams.page,
        limit: normalizedParams.limit,
        total: 0,
        pages: 0,
        hasNextPage: false,
        hasPrevPage: false
      };

      set({
        products: [],
        pagination: emptyPagination,
        error: error.message || 'Error al cargar productos',
        isLoading: false
      });
      console.error(error);

      return { products: [], pagination: emptyPagination };
    }
  },

  // Invalidar cache (usar despues de crear/editar/eliminar)
  invalidateCache: () => set({ lastFetched: null, lastQueryKey: null }),

  // Actualizacion optimista (opcional, para UI instantanea)
  addProduct: (newProduct) => set((state) => ({
    products: [...state.products, newProduct]
  })),

  updateProduct: (updatedProduct) => set((state) => ({
    products: state.products.map((p) => (p._id === updatedProduct._id ? updatedProduct : p))
  })),

  removeProduct: (productId) => set((state) => ({
    products: state.products.filter((p) => p._id !== productId)
  }))
}));


