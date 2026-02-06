import React from 'react';
import { Target, DollarSign, MessageCircle, Users, Percent, Calendar, FileText, Phone, PhoneCall, HeartHandshake, ArrowUpRight } from 'lucide-react';
import { Commercial, StatsGlobales, PerformanceData, SourcesClients, HeuresActivite, ProduitsPopulaires } from '@/app/lib/definitions';

interface OverviewViewProps {
    statsGlobales: StatsGlobales;
    performanceData: PerformanceData[];
    sourcesClients: SourcesClients[];
    heuresActivite: HeuresActivite[];
    produitsPopulaires: ProduitsPopulaires[];
    commerciaux: Commercial[];
    getStatusColor: (status: 'online' | 'away' | 'offline') => string;
}

export default function OverviewView({
    statsGlobales,
    performanceData,
    sourcesClients,
    commerciaux,
    getStatusColor
}: OverviewViewProps) {
    return (
        <>
            {/* Stats globales principales */}
            <div className="grid grid-cols-5 gap-4 mb-6">
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +12%
                  </span>
                </div>
                <h3 className="text-gray-600 text-xs mb-1">Conversions</h3>
                <p className="text-2xl font-bold text-gray-900">{statsGlobales.totalConversions}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-500">/{statsGlobales.objectifGlobal}</p>
                  <p className="text-xs font-medium text-blue-600">{Math.round((statsGlobales.totalConversions / statsGlobales.objectifGlobal) * 100)}%</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +18%
                  </span>
                </div>
                <h3 className="text-gray-600 text-xs mb-1">CA Total</h3>
                <p className="text-2xl font-bold text-gray-900">{(statsGlobales.totalCA / 1000000).toFixed(1)}M</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-500">Obj: {(statsGlobales.caObjectifGlobal / 1000000).toFixed(1)}M</p>
                  <p className="text-xs font-medium text-green-600">{Math.round((statsGlobales.totalCA / statsGlobales.caObjectifGlobal) * 100)}%</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +8%
                  </span>
                </div>
                <h3 className="text-gray-600 text-xs mb-1">Messages</h3>
                <p className="text-2xl font-bold text-gray-900">{statsGlobales.totalMessages}</p>
                <p className="text-xs text-gray-500 mt-2">{statsGlobales.totalConversationsActives} conv. actives</p>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +15%
                  </span>
                </div>
                <h3 className="text-gray-600 text-xs mb-1">Nouveaux contacts</h3>
                <p className="text-2xl font-bold text-gray-900">{statsGlobales.totalNouveauxContacts}</p>
                <p className="text-xs text-gray-500 mt-2">{statsGlobales.commerciauxActifs}/{commerciaux.length} actifs</p>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                    <Percent className="w-5 h-5 text-pink-600" />
                  </div>
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +5%
                  </span>
                </div>
                <h3 className="text-gray-600 text-xs mb-1">Taux conversion</h3>
                <p className="text-2xl font-bold text-gray-900">{statsGlobales.tauxConversionMoyen}%</p>
                <p className="text-xs text-gray-500 mt-2">Satisfaction: {statsGlobales.satisfactionMoyenne}★</p>
              </div>
            </div>

            {/* Stats secondaires */}
            <div className="grid grid-cols-6 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-semibold text-blue-900">RDV pris</h4>
                </div>
                <p className="text-xl font-bold text-blue-900">{statsGlobales.totalRDV}</p>
                <p className="text-xs text-blue-700 mt-1">{statsGlobales.totalRDVHonores} honorés ({Math.round((statsGlobales.totalRDVHonores / statsGlobales.totalRDV) * 100)}%)</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <h4 className="text-xs font-semibold text-green-900">Devis</h4>
                </div>
                <p className="text-xl font-bold text-green-900">{statsGlobales.totalDevis}</p>
                <p className="text-xs text-green-700 mt-1">{statsGlobales.totalDevisAcceptes} acceptés ({Math.round((statsGlobales.totalDevisAcceptes / statsGlobales.totalDevis) * 100)}%)</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-purple-600" />
                  <h4 className="text-xs font-semibold text-purple-900">Appels sortants</h4>
                </div>
                <p className="text-xl font-bold text-purple-900">{statsGlobales.totalAppelsSortants}</p>
                <p className="text-xs text-purple-700 mt-1">Proactivité</p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <PhoneCall className="w-4 h-4 text-orange-600" />
                  <h4 className="text-xs font-semibold text-orange-900">Appels reçus</h4>
                </div>
                <p className="text-xl font-bold text-orange-900">{statsGlobales.totalAppelsRecus}</p>
                <p className="text-xs text-orange-700 mt-1">Demandes entrantes</p>
              </div>

              <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg border border-teal-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-teal-600" />
                  <h4 className="text-xs font-semibold text-teal-900">Panier moyen</h4>
                </div>
                <p className="text-xl font-bold text-teal-900">{(statsGlobales.panierMoyen / 1000).toFixed(0)}K</p>
                <p className="text-xs text-teal-700 mt-1">FCFA par vente</p>
              </div>

              <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-4 rounded-lg border border-pink-200">
                <div className="flex items-center gap-2 mb-2">
                  <HeartHandshake className="w-4 h-4 text-pink-600" />
                  <h4 className="text-xs font-semibold text-pink-900">Fidélisation</h4>
                </div>
                <p className="text-xl font-bold text-pink-900">{statsGlobales.tauxFidelisationMoyen}%</p>
                <p className="text-xs text-pink-700 mt-1">Taux moyen équipe</p>
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Performance de la semaine</h3>
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-600 rounded"></div>
                      <span className="text-gray-600">Conversions</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-4 h-64">
                  {performanceData.map((jour, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-3">
                      <div className="text-sm font-semibold text-gray-900">{jour.conversions}</div>
                      <div className="w-full relative" style={{ height: '180px' }}>
                        <div 
                          className="absolute bottom-0 w-full bg-blue-600 rounded-t hover:bg-blue-700 transition-all cursor-pointer"
                          style={{ height: `${(jour.conversions / 50) * 100}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-600 font-medium">{jour.jour}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Sources de trafic</h3>
                <div className="space-y-4">
                  {sourcesClients.map((source, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{source.name}</span>
                        <span className="text-sm font-bold text-gray-900">{source.value}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className={`${source.color} h-3 rounded-full transition-all`}
                          style={{ width: `${source.value}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top performers */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performers du jour</h3>
              <div className="grid grid-cols-3 gap-4">
                {commerciaux
                  .sort((a, b) => b.tauxConversion - a.tauxConversion)
                  .slice(0, 3)
                  .map((commercial, idx) => (
                    <div key={commercial.id} className="border border-gray-200 rounded-lg p-4 relative hover:shadow-md transition-shadow">
                      {idx === 0 && (
                        <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white font-bold text-lg">🏆</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold relative`}>
                          {commercial.avatar}
                          <div className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(commercial.status)} border-2 border-white rounded-full`}></div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900">{commercial.name}</h4>
                          <p className="text-xs text-gray-500">{commercial.conversionsJour} conversions</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500">CA</p>
                          <p className="font-semibold text-gray-900">{(commercial.ca / 1000).toFixed(0)}K</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Taux conv.</p>
                          <p className="font-semibold text-gray-900">{commercial.tauxConversion}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </>
    );
}
