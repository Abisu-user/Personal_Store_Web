module.exports = function(source) {
  const names = [...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]);
  return "export default " + JSON.stringify(Object.fromEntries(names.map(name => [name, name])));
};
