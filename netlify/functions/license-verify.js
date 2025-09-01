exports.handler = async function(event, context) {
  const key = event.queryStringParameters.key;
  // Demo: acepta cualquier clave de al menos 8 caracteres
  const valid = key && key.length >= 8;
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valid })
  };
};
