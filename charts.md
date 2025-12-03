---
title: Dataset charts
order: 32
---
# Dataset powered charts

Add a YAML code block with language `yaml` and metadata `chart` to hydrate a Plotly visualization. Provide an SQL query that DuckDB can run against the attached dataset (refer to tables through the `dataset` schema) and alias the result columns to `label` and `value` so the pie preset understands the response.

``````markdown
```yaml chart
sql: |
  SELECT type AS label,
         COUNT(*) AS value
  FROM dataset.assets
  GROUP BY type
  ORDER BY value DESC
chart_id: pie_chart
title: Asset type distribution
```
``````

```yaml chart
sql: |
  SELECT type AS label,
         COUNT(*) AS value
  FROM dataset.assets
  GROUP BY type
  ORDER BY value DESC
chart_id: pie_chart
title: Asset type distribution
```


The query above counts every row in `dataset.assets` grouped by its `type` column and feeds the aggregated data to the `pie_chart` preset, producing a quick overview of how many assets belong to each type.
