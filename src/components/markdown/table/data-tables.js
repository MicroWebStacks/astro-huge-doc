import 'datatables.net-dt/css/jquery.dataTables.css'

function checkEntries(table, tableElement) {
    const info = table.page.info();
    if (info.recordsTotal < 10) {
        tableElement.parentElement.querySelector('.dataTables_length').style.display = 'none';
        tableElement.parentElement.querySelector('.dataTables_info').style.display = 'none';
        tableElement.parentElement.querySelector('.dataTables_paginate').style.display = 'none';
    }
    if (info.recordsTotal < 5) {
        tableElement.parentElement.querySelector('.dataTables_filter').style.display = 'none';
    }
}

async function init(){
    const containers_els = document.querySelectorAll(".data-table")
    if(containers_els.length === 0){//prevent irrelvant page execution
      return
    }

    const DataTable = (await import('datatables.net-dt')).default;

    containers_els.forEach(async table_element => {
        const data_table_url = table_element.getAttribute("data-table-url")
        const response = await fetch(`${data_table_url}`);
        if (!response.ok) {
            throw new Error(`Failed to load ${data_table_url}`);
        }
        const data_table = await response.json();
        if (!Array.isArray(data_table) || data_table.length === 0) {
            console.warn(`No data available for table ${data_table_url}`);
            return;
        }

        const columns = Object.keys(data_table[0]).map(key => ({
            title: key,
            data: key
        }));

        const table = new DataTable(table_element,{
            order:[],
            data: data_table,
            columns
        });
        checkEntries(table, table_element);
    })
  }
  
document.addEventListener('DOMContentLoaded', init, false);
