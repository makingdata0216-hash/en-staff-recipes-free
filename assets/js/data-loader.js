
  // Static JSON on this site; no external API or usage-based service.
  window.EN_DATA_READY = fetch('./data/recipes.json')
    .then(response => {
      if (!response.ok) throw new Error('Recipe JSON HTTP ' + response.status);
      return response.json();
    })
    .then(data => { window.EN_DATA = data; })
    .catch(error => { console.error('Recipe data loading failed:', error); });
