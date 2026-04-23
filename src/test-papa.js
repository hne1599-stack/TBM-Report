const Papa = require('papaparse');
Papa.parse('https://docs.google.com/spreadsheets/d/1nLyXl91kjO6enPj8JxTT7gNTzUakyA1cENFm16jlb7w/gviz/tq?tqx=out:csv&sheet=사업장목록', {
  download: true,
  complete: function(results) {
    console.log(results.data);
  }
});
