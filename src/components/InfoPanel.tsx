import { InfoPanelState, RouteFeature, RouteStatusData, RouteStatus } from '../types';

interface InfoPanelProps {
  state: InfoPanelState;
  routes: RouteFeature[] | null;
  routeStatus: RouteStatusData | null;
  onClose: () => void;
  onMarkPaid: (routeId: string) => void;
  onUnmarkPaid: (routeId: string) => void;
  onBuyPass: (routeId: string) => void;
  onNavigate: (view: InfoPanelState['view']) => void;
  onRouteClick: (routeId: string) => void;
  isRoutePaid: (routeId: string) => boolean;
}

export default function InfoPanel({
  state,
  routes,
  routeStatus,
  onClose,
  onMarkPaid,
  onUnmarkPaid,
  onBuyPass,
  onNavigate,
  onRouteClick,
  isRoutePaid
}: InfoPanelProps) {

  // Helper function to get status for a route
  const getRouteStatus = (routeId: string): RouteStatus | null => {
    if (!routeStatus) return null;
    return routeStatus.routes[routeId]?.status || null;
  };

  // Helper function to render status badge
  const renderStatusBadge = (status: RouteStatus | null) => {
    if (!status) return null;

    const statusConfig = {
      open: { label: 'Open', bgColor: '#d1fae5', color: '#065f46' },
      closed: { label: 'Closed', bgColor: '#fee2e2', color: '#991b1b' },
      partially_open: { label: 'Partial', bgColor: '#fef3c7', color: '#92400e' },
      unknown: { label: 'Unknown', bgColor: '#e5e7eb', color: '#374151' }
    };

    const config = statusConfig[status];

    return (
      <span style={{
        backgroundColor: config.bgColor,
        color: config.color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase'
      }}>
        {config.label}
      </span>
    );
  };
  const renderMainView = () => (
    <div className="info-content">
      <h2>Madeira Hiking</h2>
      <p>Track your location on hiking routes and manage trail passes.</p>
      <nav className="info-nav">
        <button onClick={() => onNavigate('routes-list')}>Routes List</button>
        <button onClick={() => onNavigate('pass-info')}>Pass Info</button>
        <button onClick={() => onNavigate('about')}>About</button>
      </nav>
    </div>
  );

  const renderRouteDetail = (route: RouteFeature, distance?: number) => {
    const routeId = route.properties.id;
    const isPaid = isRoutePaid(routeId);
    const isNearby = distance !== undefined && distance <= 50;
    const props = route.properties;
    const status = getRouteStatus(routeId);

    return (
      <div className="info-content route-detail">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>{props.name}</h2>
          {renderStatusBadge(status)}
        </div>

        {isNearby && !isPaid && (
          <div className="warning-message">
            <strong>Warning:</strong> You are on a route that requires a pass, and you haven't marked it as paid yet!
          </div>
        )}

        {isNearby && isPaid && (
          <div className="success-message">
            You have a pass for this route today.
          </div>
        )}

        {!isNearby && !isPaid && (
          <div className="info-message">
            You haven't paid for this route, but you are not on it. You don't have to pay unless you plan to walk on it today.
          </div>
        )}

        {!isNearby && isPaid && (
          <div className="success-message">
            You have a pass for this route today.
          </div>
        )}

        {/* Route Information */}
        <div className="route-info">
          {(props.from || props.to) && (
            <div className="route-info-item">
              <span className="route-info-label">Route:</span>
              <span className="route-info-value">
                {props.from || '?'} → {props.to || '?'}
              </span>
            </div>
          )}

          {props.distance && (
            <div className="route-info-item">
              <span className="route-info-label">Distance:</span>
              <span className="route-info-value">
                {props.distance} km
                {props.roundtrip === 'yes' && ' (roundtrip)'}
              </span>
            </div>
          )}

          {props.charge && (
            <div className="route-info-item">
              <span className="route-info-label">Fee:</span>
              <span className="route-info-value">{props.charge}</span>
            </div>
          )}

          {props['website:en'] && (
            <div className="route-info-item">
              <span className="route-info-label">More info:</span>
              <a
                href={props['website:en']}
                target="_blank"
                rel="noopener noreferrer"
                className="route-info-link"
              >
                Visit Madeira Trail Guide
              </a>
            </div>
          )}

          {props['osmc:symbol'] && (
            <div className="route-info-item">
              <span className="route-info-label">Trail markers:</span>
              <span className="route-info-value trail-marker">
                {props['osmc:symbol'].split(':').slice(3, 4)[0] || props.ref}
              </span>
            </div>
          )}
        </div>

        <div className="button-group">
          {isPaid ? (
            <button
              className="btn-secondary"
              onClick={() => {
                if (window.confirm('Are you sure you want to unmark this route as paid? This might have been marked by mistake.')) {
                  onUnmarkPaid(routeId);
                }
              }}
            >
              Unmark as Paid
            </button>
          ) : (
            <>
              <button
                className="btn-primary"
                onClick={() => {
                  if (window.confirm('Are you sure you have already paid for this route today?')) {
                    onMarkPaid(routeId);
                  }
                }}
              >
                Mark as Already Paid for Today
              </button>

              <button
                className="btn-secondary"
                onClick={() => {
                  if (window.confirm(
                    'You will be redirected to the Madeira payment portal. After completing the payment, please return here and mark the route as paid.'
                  )) {
                    onBuyPass(routeId);
                  }
                }}
              >
                Buy Pass for Today
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderRoutesList = () => {
    if (!routes) {
      return (
        <div className="info-content">
          <h2>Routes List</h2>
          <p>Loading routes...</p>
          <button className="btn-secondary" onClick={() => onNavigate('main')}>
            Back to Menu
          </button>
        </div>
      );
    }

    // Sort routes by reference code (PR1, PR2, etc.)
    const sortedRoutes = [...routes].sort((a, b) => {
      const refA = a.properties.ref || '';
      const refB = b.properties.ref || '';
      return refA.localeCompare(refB, undefined, { numeric: true });
    });

    return (
      <div className="info-content">
        <h2>All Hiking Routes</h2>
        <p style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
          {routes.length} paid hiking routes in Madeira
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {sortedRoutes.map((route) => {
            const props = route.properties;
            const isPaid = isRoutePaid(props.id);
            const status = getRouteStatus(props.id);

            return (
              <div
                key={props.id}
                onClick={() => onRouteClick(props.id)}
                style={{
                  padding: '12px',
                  backgroundColor: isPaid ? '#f0fdfa' : '#faf5ff',
                  border: `2px solid ${isPaid ? '#14b8a6' : '#8b5cf6'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {props.ref && (
                      <span style={{
                        backgroundColor: isPaid ? '#14b8a6' : '#8b5cf6',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {props.ref}
                      </span>
                    )}
                    {isPaid && (
                      <span style={{ fontSize: '16px' }}>✓</span>
                    )}
                    {renderStatusBadge(status)}
                  </div>
                  {props.distance && (
                    <span style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      {props.distance} km
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '15px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                  {props.name}
                </div>

                {(props.from || props.to) && (
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                    {props.from || '?'} → {props.to || '?'}
                  </div>
                )}

                {props['website:en'] && (
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>
                    <a
                      href={props['website:en']}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: isPaid ? '#14b8a6' : '#8b5cf6', textDecoration: 'none', fontWeight: '500' }}
                    >
                      View details →
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn-secondary" onClick={() => onNavigate('main')}>
          Back to Menu
        </button>
      </div>
    );
  };

  const renderPassInfo = () => (
    <div className="info-content">
      <h2>Madeira Pass Information</h2>
      <p>
        Most hiking routes (PR trails) in Madeira require a daily pass fee of €3 per person.
      </p>
      <p>
        You can purchase passes at:
      </p>
      <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
        <li>The official Simplifica portal (online)</li>
        <li>Local tourist offices</li>
        <li>Trail entrances (where available)</li>
      </ul>
      <p>
        <strong>Important:</strong> Passes are valid for one day only and expire at midnight.
      </p>
      <a
        href="https://simplifica.madeira.gov.pt/services/78-82-259"
        target="_blank"
        rel="noopener noreferrer"
        className="route-info-link"
        style={{ display: 'inline-block', marginTop: '8px' }}
      >
        Visit Official Payment Portal
      </a>
      <button className="btn-secondary" onClick={() => onNavigate('main')} style={{ marginTop: '16px' }}>
        Back to Menu
      </button>
    </div>
  );

  const renderAbout = () => (
    <div className="info-content">
      <h2>About</h2>
      <p>
        <strong>Madeira Hiking</strong> is a location-aware web app that helps you track which
        hiking routes require payment and manages your daily passes.
      </p>
      <p>
        The app uses your location to warn you when you're approaching a route that requires
        a pass, and helps you keep track of which routes you've already paid for today.
      </p>
      <p style={{ fontSize: '14px', color: '#666', marginTop: '16px' }}>
        This is an open-source project. Route data is sourced from OpenStreetMap and the
        official Madeira government portal.
      </p>
      <button className="btn-secondary" onClick={() => onNavigate('main')}>
        Back to Menu
      </button>
    </div>
  );

  const renderContent = () => {
    if (state.view === 'main') {
      return renderMainView();
    } else if (state.view === 'route-detail' && state.selectedRoute) {
      return renderRouteDetail(
        state.selectedRoute,
        state.nearbyRoute?.distance
      );
    } else if (state.view === 'routes-list') {
      return renderRoutesList();
    } else if (state.view === 'pass-info') {
      return renderPassInfo();
    } else if (state.view === 'about') {
      return renderAbout();
    }
    return null;
  };

  return (
    <div className={`info-panel ${state.isOpen ? 'open' : ''}`}>
      <div className="info-panel-header">
        <button className="close-btn" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      {renderContent()}
    </div>
  );
}
