import { InfoPanelState, RouteFeature } from '../types';

interface InfoPanelProps {
  state: InfoPanelState;
  onClose: () => void;
  onMarkPaid: (routeId: string) => void;
  onUnmarkPaid: (routeId: string) => void;
  onBuyPass: (routeId: string) => void;
  onNavigate: (view: InfoPanelState['view']) => void;
  isRoutePaid: (routeId: string) => boolean;
}

export default function InfoPanel({
  state,
  onClose,
  onMarkPaid,
  onUnmarkPaid,
  onBuyPass,
  onNavigate,
  isRoutePaid
}: InfoPanelProps) {
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

    return (
      <div className="info-content route-detail">
        <h2>{props.name}</h2>

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

  const renderRoutesList = () => (
    <div className="info-content">
      <h2>Routes List</h2>
      <p>This feature will display a list of all paid hiking routes in Madeira.</p>
      <p>Coming soon!</p>
      <button className="btn-secondary" onClick={() => onNavigate('main')}>
        Back to Menu
      </button>
    </div>
  );

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
