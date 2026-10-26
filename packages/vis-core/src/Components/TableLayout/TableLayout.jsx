import React, { useEffect, useState, useMemo } from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { api } from "../../services";
import { SimpleDropdown } from "./SimpleDropdown";

const PageContainer = styled.div`
  height: 100%;
  width: 100%;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const RowCountSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  flex-shrink: 0;
`;

const ResetButton = styled.button`
  padding: 6px 12px;
  background: #6b46c1;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #5a3a9e;
  }

  &:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }
`;

const Badge = styled.span`
  background: #f3f4f6;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 600;
  color: #1f2937;
`;

const FilterLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  letter-spacing: 0.5px;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
  background: #fff;
  margin: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e7eb;
  position: relative;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: #fff;
`;

const TableHeaderCell = styled.th`
  text-align: left;
  padding: 0;
  background: #6b46c1;
  border: 1px solid #5a3a9e;
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
  vertical-align: top;
`;

const HeaderContent = styled.div`
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HeaderTitle = styled.div`
  font-weight: 600;
  color: #fff;
`;

const HeaderFilterWrapper = styled.div`
  & .dropdown-container {
    background: #fff;
  }
`;

const TableDataCell = styled.td`
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  color: #1f2937;
  font-size: 0.875rem;
  background: #fff;
  text-align: ${props => props.$isNumeric ? 'right' : 'left'};

  tr:hover & {
    background-color: #f9fafb;
  }
`;

const StatusMessage = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: #6b7280;
  font-size: 1rem;
`;

const EmptyStateOverlay = styled.div`
  position: absolute;
  top: 100px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
`;

const EmptyStateMessage = styled.div`
  padding: 24px 32px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
  pointer-events: auto;
`;

/**
 * TableLayout component displays tabular data with filtering capabilities.
 * Fetches data from a specified endpoint and renders it in a filterable table format.
 *
 * @component
 * @param {Object} props - The component props.
 * @param {Object} props.config - Configuration object for the table.
 * @param {Object} props.config.recordsEndpoint - Endpoint configuration for fetching table data.
 * @param {string} props.config.recordsEndpoint.path - API path to fetch records from.
 * @param {Object} [props.config.recordsEndpoint.requestOptions] - Optional request configuration.
 * @param {Array} props.config.columns - Array of column definitions.
 * @param {string} props.config.columns[].accessor - Property name to access data in each row.
 * @param {string} props.config.columns[].header - Display name for the column header.
 * @param {boolean} [props.config.columns[].filter] - Whether to show a filter dropdown for this column.
 * @param {string} [props.config.columns[].type] - Data type of the column (e.g., 'boolean').
 * @param {string} [props.config.columns[].linkTemplate] - In-app path the cell links to, with
 *   `{field}` placeholders filled from the row, for example `/sites/{id}`.
 * @returns {JSX.Element} The rendered TableLayout component.
 */
/** Fills `{field}` placeholders in a link template from a row, URL-encoding each value. */
export const fillLinkTemplate = (template, row) =>
  template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(row?.[key] ?? ""));

export function TableLayout({ config }) {
  const { recordsEndpoint, columns = [] } = config || {};
  
  // Ensure columns is an array
  const safeColumns = Array.isArray(columns) ? columns : [];
  
  // Early return if no recordsEndpoint
  if (!recordsEndpoint || !recordsEndpoint.path) {
    return (
      <PageContainer>
        <StatusMessage>Invalid configuration: missing recordsEndpoint</StatusMessage>
      </PageContainer>
    );
  }
  
  const [tableData, setTableData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [filterValues, setFilterValues] = useState({});

  // Helper function to determine if a value is numeric
  const isNumericValue = (value) => {
    if (value == null || value === "") return false;
    if (typeof value === 'number') return true;
    if (typeof value === 'boolean') return false;
    
    // Check if string represents a number
    const strValue = String(value).trim();
    return !isNaN(strValue) && !isNaN(parseFloat(strValue)) && strValue !== '';
  };

  // Helper function to format cell values for display
  const formatCellValue = (value, column) => {
    if (value == null || value === "") return "";
    
    // Handle boolean values
    if (typeof value === 'boolean') {
      return value ? "Yes" : "No";
    }
    
    // Handle column type-specific formatting
    if (column?.type === 'boolean') {
      // Convert string representations of booleans
      if (value === 'true' || value === '1' || value === 1) return "Yes";
      if (value === 'false' || value === '0' || value === 0) return "No";
    }
    
    return String(value);
  };

  // Helper function to reset all filters
  const resetFilters = () => {
    setFilterValues({});
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filterValues).some(val => val && val !== "");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    const fetchData = async () => {
      try {
        const result = await api.baseService.get(
          recordsEndpoint.path,
          recordsEndpoint.requestOptions || {}
        );

        if (!cancelled) {
          const dataArray = Array.isArray(result) ? result : (result.data || result.records || []);
          const validArray = Array.isArray(dataArray) ? dataArray : [];
          
          // Remove duplicates based on reference_id (keep first occurrence)
          const deduplicatedData = validArray.reduce((acc, row) => {
            const refId = row?.reference_id || row?.id || row?._id;
            if (refId && !acc.some(r => (r?.reference_id || r?.id || r?._id) === refId)) {
              acc.push(row);
            } else if (!refId) {
              // Keep rows without any ID
              acc.push(row);
            }
            return acc;
          }, []);
          
          setTableData(deduplicatedData);
        }
      } catch (err) {
        console.error("Error fetching table data:", err);
        if (!cancelled) {
          setFetchError(err.message);
          setTableData([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [recordsEndpoint?.path, recordsEndpoint?.requestOptions]);

  // Filter data client-side based on filter values
  const filteredData = useMemo(() => {
    if (!Array.isArray(tableData)) return [];
    const filtered = tableData.filter((row) => {
      return safeColumns.every((column) => {
        const filterValue = filterValues[column?.accessor];
        if (!filterValue || filterValue === "") return true;
        
        const rowValue = row[column?.accessor];
        const formattedRowValue = formatCellValue(rowValue, column);
        
        // If column has a spacer, use substring matching
        if (column?.spacer) {
          return formattedRowValue.includes(filterValue);
        }
        
        // Exact match - compare formatted values
        return formattedRowValue === filterValue;
      });
    });
    
    // Sort by columns that have sort: true, in order
    const sortColumns = safeColumns.filter(col => col?.sort === true);
    if (sortColumns.length > 0) {
      return [...filtered].sort((a, b) => {
        for (const column of sortColumns) {
          const aVal = a[column.accessor];
          const bVal = b[column.accessor];
          
          // Handle null/undefined values
          if (aVal == null && bVal == null) continue;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          
          // Compare values
          if (aVal < bVal) return -1;
          if (aVal > bVal) return 1;
        }
        return 0;
      });
    }
    
    return filtered;
  }, [tableData, safeColumns, filterValues]);

  // Generate unique filter options for each column based on currently filtered data
  const getColumnFilterOptions = (accessor) => {
    // Find the column definition to check its type
    const column = safeColumns.find(col => col?.accessor === accessor);
    
    // Get data that is filtered by all OTHER filters (not this one)
    const dataFilteredByOthers = tableData.filter((row) => {
      return safeColumns.every((col) => {
        // Skip the current column we're generating options for
        if (col?.accessor === accessor) return true;
        
        const filterValue = filterValues[col?.accessor];
        if (!filterValue || filterValue === "") return true;
        
        const rowValue = row[col?.accessor];
        const formattedRowValue = formatCellValue(rowValue, col);
        
        // If column has a spacer, use substring matching
        if (col?.spacer) {
          return formattedRowValue.includes(filterValue);
        }
        
        // Exact match - compare formatted values
        return formattedRowValue === filterValue;
      });
    });
    
    // If column has a spacer, split values and get unique items
    if (column?.spacer) {
      const allValues = dataFilteredByOthers.flatMap(row => {
        const value = row[accessor];
        const formattedValue = formatCellValue(value, column);
        if (!formattedValue) return [];
        
        // Split by spacer and trim each item
        return formattedValue.split(column.spacer).map(item => item.trim());
      });
      
      const uniqueValues = [...new Set(allValues)]
        .filter(val => val != null && val !== "")
        .sort();
      
      return uniqueValues;
    }
    
    // Default behavior: exact unique values
    const uniqueValues = [...new Set(dataFilteredByOthers.map(row => {
      const value = row[accessor];
      // Format the value the same way it will be displayed
      return formatCellValue(value, column);
    }))]
      .filter(val => val != null && val !== "")
      .sort();
    
    return uniqueValues;
  };

  return (
    <PageContainer>
      {/* Row count section above table */}
      <RowCountSection>
          <span>Rows</span>
          <Badge>{filteredData.length}</Badge>
          <ResetButton 
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            Reset Filters
          </ResetButton>
        </RowCountSection>

        <TableContainer>
        {isLoading ? (
          <StatusMessage>Loading...</StatusMessage>
        ) : fetchError ? (
          <StatusMessage>Error: {fetchError}</StatusMessage>
        ) : (
          <>
            {filteredData.length === 0 && (
              <EmptyStateOverlay>
                <EmptyStateMessage>
                  {tableData.length === 0 ? "No data to display" : "No results match your filters"} {/* Differentiate no data vs no filter results */}
                </EmptyStateMessage>
              </EmptyStateOverlay>
            )}
            <Table>
            <thead>
              <tr>
                {safeColumns.map((column) => (
                  <TableHeaderCell key={column?.accessor}>
                    <HeaderContent>
                      <HeaderTitle>{column?.header}</HeaderTitle>
                      {column?.filter && (
                        <HeaderFilterWrapper>
                          <SimpleDropdown
                            options={getColumnFilterOptions(column?.accessor)}
                            value={filterValues[column?.accessor] || ""}
                            onChange={(value) =>
                              setFilterValues((prev) => ({
                                ...prev,
                                [column?.accessor]: value,
                              }))
                            }
                            placeholder="All"
                          />
                        </HeaderFilterWrapper>
                      )}
                    </HeaderContent>
                  </TableHeaderCell>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => {
                const rowKey = `${row?.reference_id || row?.id || row?._id || 'row'}-${rowIndex}`;
                return (
                  <tr key={rowKey}>
                    {safeColumns.map((column) => {
                      const cellValue = row?.[column?.accessor];
                      return (
                        <TableDataCell 
                          key={column?.accessor}
                          $isNumeric={isNumericValue(cellValue)}
                        >
                          {column?.linkTemplate ? (
                            <Link to={fillLinkTemplate(column.linkTemplate, row)}>
                              {formatCellValue(cellValue, column)}
                            </Link>
                          ) : (
                            formatCellValue(cellValue, column)
                          )}
                        </TableDataCell>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </>
        )}
      </TableContainer>
    </PageContainer>
  );
}
