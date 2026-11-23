'use strict';

function chooseSource(sources) {
  return new Promise(resolve => {
    const list = document.getElementById('sources');
    sources.forEach(({ name, thumbnail }, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      if (thumbnail) {
        const image = document.createElement('img');
        image.src = thumbnail;
        image.alt = '';
        button.append(image);
      }
      const title = document.createElement('span');
      title.textContent = name;
      button.append(title);
      button.addEventListener('click', () => resolve(index));
      list.append(button);
    });

    document.getElementById('cancel').addEventListener('click', () => resolve(-1));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') resolve(-1);
    });
    list.firstElementChild?.focus();
  });
}
