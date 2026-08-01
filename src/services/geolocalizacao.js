const axios = require('axios');
const { getDatabase } = require('../database/connection');

class Geolocalizacao {
    
    static calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    static async encontrarUnidadeProxima(latitude, longitude) {
        const db = getDatabase();
        const unidades = db.prepare('SELECT * FROM unidades WHERE ativo = 1').all();
        
        const resultados = [];
        for (const unidade of unidades) {
            if (unidade.latitude && unidade.longitude) {
                const distancia = this.calcularDistancia(
                    latitude, longitude,
                    unidade.latitude, unidade.longitude
                );
                resultados.push({ ...unidade, distancia: parseFloat(distancia.toFixed(2)) });
            }
        }
        
        return resultados.sort((a, b) => a.distancia - b.distancia);
    }
    
    static async buscarCoordenadas(endereco) {
        try {
            const response = await axios.get(process.env.OPENSTREETMAP_URL + '/search', {
                params: { q: endereco, format: 'json', limit: 1 },
                headers: { 'User-Agent': 'PizzariaBot/1.0' }
            });
            
            if (response.data.length > 0) {
                return {
                    latitude: parseFloat(response.data[0].lat),
                    longitude: parseFloat(response.data[0].lon)
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}

module.exports = Geolocalizacao;
