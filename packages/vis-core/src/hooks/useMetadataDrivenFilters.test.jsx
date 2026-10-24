import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { FilterContext, PageContext } from 'contexts';
import { api } from 'services';
import { useMetadataDrivenFilters } from './useMetadataDrivenFilters';

jest.mock('services', () => ({
  api: {
    baseService: {
      get: jest.fn(),
      post: jest.fn(),
    },
  },
}));

describe('useMetadataDrivenFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sorts metadata table options by numeric-like sortColumn values', async () => {
    api.baseService.get.mockResolvedValue([
      { id: 'alpha', name: 'Alpha', display_order: '10' },
      { id: 'zebra', name: 'Zebra', display_order: '1' },
      { id: 'middle', name: 'Middle', display_order: '2' },
    ]);

    const pageContext = {
      config: {
        metadataTables: [
          { name: 'dropdown_options', path: '/metadata/dropdown-options' },
        ],
        filters: [
          {
            filterName: 'Example filter',
            paramName: 'example_filter',
            type: 'dropdown',
            values: {
              source: 'metadataTable',
              metadataTableName: 'dropdown_options',
              displayColumn: 'name',
              paramColumn: 'id',
              sortColumn: 'display_order',
              sort: 'ascending',
            },
          },
        ],
      },
    };

    const filterDispatch = jest.fn();
    const wrapper = ({ children }) => (
      <PageContext.Provider value={pageContext}>
        <FilterContext.Provider value={{ state: {}, dispatch: filterDispatch }}>
          {children}
        </FilterContext.Provider>
      </PageContext.Provider>
    );

    const { result } = renderHook(() => useMetadataDrivenFilters(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.filters[0].values.values.map((value) => value.displayValue)).toEqual([
      'Zebra',
      'Middle',
      'Alpha',
    ]);
    expect(filterDispatch).toHaveBeenCalledWith({
      type: 'INITIALIZE_FILTERS',
      payload: expect.objectContaining({ [result.current.filters[0].id]: 'zebra' }),
    });
  });

  it('takes dateRange min and max from a metadata table and initialises the range', async () => {
    api.baseService.get.mockResolvedValue([
      { survey_date: '2025-10-08T00:00:00', counted: true },
      { survey_date: '2025-10-06', counted: true },
      { survey_date: '2025-10-19', counted: true },
      { survey_date: '2025-11-30', counted: false },
    ]);

    const pageContext = {
      config: {
        metadataTables: [{ name: 'survey_days', path: '/metadata/survey-days-date-range' }],
        filters: [
          {
            filterName: 'Survey dates',
            paramName: ['date_from', 'date_to'],
            type: 'dateRange',
            defaultValue: ['min', 'max'],
            extraToggle: { paramName: 'include_excluded', label: 'Include excluded days', defaultValue: false },
            values: {
              source: 'metadataTable',
              metadataTableName: 'survey_days',
              column: 'survey_date',
              where: [{ column: 'counted', operator: 'equals', values: true }],
            },
          },
        ],
      },
    };

    const filterDispatch = jest.fn();
    const wrapper = ({ children }) => (
      <PageContext.Provider value={pageContext}>
        <FilterContext.Provider value={{ state: {}, dispatch: filterDispatch }}>
          {children}
        </FilterContext.Provider>
      </PageContext.Provider>
    );

    const { result } = renderHook(() => useMetadataDrivenFilters(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));

    const [filter] = result.current.filters;
    expect(filter.min).toBe('2025-10-06');
    expect(filter.max).toBe('2025-10-19');
    expect(result.current.emptyMetadataFilters).toEqual([]);
    expect(result.current.paramNameToUuidMap).toMatchObject({
      date_from: filter.id,
      date_to: filter.id,
      include_excluded: filter.id,
    });
    expect(filterDispatch).toHaveBeenCalledWith({
      type: 'INITIALIZE_FILTERS',
      payload: { [filter.id]: ['2025-10-06', '2025-10-19', false] },
    });
  });
});
