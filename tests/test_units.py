"""
Tests for the timber units module.

This module tests the unit conversion system, formatting, and parsing
for both metric and imperial units.
"""

import sys
import pytest

sys.path.append("src")

from timber.units import (
    UnitSystemManager, Units, UnitConversion, UnitSystem,
    set_unit_system, get_unit_system, get_unit_manager,
    format_length, format_force, format_moment, format_stress,
    format_area, format_moment_of_inertia, format_acceleration,
    parse_length, parse_force, parse_moment, parse_stress,
    parse_area, parse_moment_of_inertia, parse_acceleration
)


class TestUnitSystemManager:
    """Test the UnitSystemManager class."""
    
    def test_metric_system_initialization(self):
        """Test metric system initialization."""
        manager = UnitSystemManager("metric")
        assert manager.system == "metric"
    
    def test_imperial_system_initialization(self):
        """Test imperial system initialization."""
        manager = UnitSystemManager("imperial")
        assert manager.system == "imperial"
    
    def test_get_conversion_metric(self):
        """Test getting conversion factors for metric units."""
        manager = UnitSystemManager("metric")
        conv = manager.get_conversion("length", Units.METER)
        assert conv.factor == 1.0
        assert conv.symbol == "m"
        
        conv = manager.get_conversion("length", Units.MILLIMETER)
        assert conv.factor == 0.001
        assert conv.symbol == "mm"
    
    def test_get_conversion_imperial(self):
        """Test getting conversion factors for imperial units."""
        manager = UnitSystemManager("imperial")
        conv = manager.get_conversion("length", Units.FOOT)
        assert conv.factor == 0.3048
        assert conv.symbol == "ft"
        
        conv = manager.get_conversion("length", Units.INCH)
        assert conv.factor == 0.0254
        assert conv.symbol == "in"
    
    def test_get_preferred_units_metric(self):
        """Test getting preferred units for metric system."""
        manager = UnitSystemManager("metric")
        assert manager.get_preferred_unit("length") == Units.MILLIMETER
        assert manager.get_preferred_unit("force") == Units.KILONEWTON
        assert manager.get_preferred_unit("moment") == Units.KILONEWTON_METER
        assert manager.get_preferred_unit("stress") == Units.GIGAPASCAL
        assert manager.get_preferred_unit("area") == Units.SQUARE_MILLIMETER
        assert manager.get_preferred_unit("moment_of_inertia") == Units.MILLIMETER_TO_FOURTH
        assert manager.get_preferred_unit("acceleration") == Units.METER_PER_SECOND_SQUARED
    
    def test_get_preferred_units_imperial(self):
        """Test getting preferred units for imperial system."""
        manager = UnitSystemManager("imperial")
        assert manager.get_preferred_unit("length") == Units.INCH
        assert manager.get_preferred_unit("force") == Units.KIP
        assert manager.get_preferred_unit("moment") == Units.KIP_FOOT
        assert manager.get_preferred_unit("stress") == Units.KSI
        assert manager.get_preferred_unit("area") == Units.SQUARE_INCH
        assert manager.get_preferred_unit("moment_of_inertia") == Units.INCH_TO_FOURTH
        assert manager.get_preferred_unit("acceleration") == Units.FOOT_PER_SECOND_SQUARED
    
    def test_convert_to_display_metric(self):
        """Test converting values to display units in metric system."""
        manager = UnitSystemManager("metric")
        
        # Test length conversion (1 m = 1000 mm)
        value, unit = manager.convert_to_display(1.0, "length", Units.METER)
        assert value == 1000.0
        assert unit == "mm"
        
        # Test force conversion (1000 N = 1 kN)
        value, unit = manager.convert_to_display(1000.0, "force", Units.NEWTON)
        assert value == 1.0
        assert unit == "kN"
    
    def test_convert_to_display_imperial(self):
        """Test converting values to display units in imperial system."""
        manager = UnitSystemManager("imperial")
        
        # Test length conversion (1 m = 39.3701 in)
        value, unit = manager.convert_to_display(1.0, "length", Units.METER)
        assert value == pytest.approx(39.3701, rel=1e-4)
        assert unit == "in"
        
        # Test force conversion (4448.22 N = 1 kip)
        value, unit = manager.convert_to_display(4448.22, "force", Units.NEWTON)
        assert value == pytest.approx(1.0, rel=1e-4)
        assert unit == "kip"
    
    def test_convert_from_display_metric(self):
        """Test converting values from display units in metric system."""
        manager = UnitSystemManager("metric")
        
        # Test length conversion (1000 mm = 1 m)
        value = manager.convert_from_display(1000.0, "length", Units.METER)
        assert value == 1.0
        
        # Test force conversion (1 kN = 1000 N)
        value = manager.convert_from_display(1.0, "force", Units.NEWTON)
        assert value == 1000.0
    
    def test_convert_from_display_imperial(self):
        """Test converting values from display units in imperial system."""
        manager = UnitSystemManager("imperial")
        
        # Test length conversion (39.3701 in = 1 m)
        value = manager.convert_from_display(39.3701, "length", Units.METER)
        assert value == pytest.approx(1.0, rel=1e-4)
        
        # Test force conversion (1 kip = 4448.22 N)
        value = manager.convert_from_display(1.0, "force", Units.NEWTON)
        assert value == pytest.approx(4448.22, rel=1e-4)
    
    def test_format_value_metric(self):
        """Test formatting values with units in metric system."""
        manager = UnitSystemManager("metric")
        
        # Test length formatting
        formatted = manager.format_value(1.0, "length", Units.METER)
        assert formatted == "1000.000 mm"
        
        # Test force formatting
        formatted = manager.format_value(1000.0, "force", Units.NEWTON)
        assert formatted == "1.000 kN"
    
    def test_format_value_imperial(self):
        """Test formatting values with units in imperial system."""
        manager = UnitSystemManager("imperial")
        
        # Test length formatting
        formatted = manager.format_value(1.0, "length", Units.METER)
        assert formatted == "39.37 in"
        
        # Test force formatting
        formatted = manager.format_value(4448.22, "force", Units.NEWTON)
        assert formatted == "1.000 kip"
    
    def test_parse_value_with_units(self):
        """Test parsing values with units."""
        manager = UnitSystemManager("metric")
        
        # Test parsing with explicit units
        value = manager.parse_value("1000 mm", "length")
        assert value == 1.0
        
        value = manager.parse_value("1 kN", "force")
        assert value == 1000.0
    
    def test_parse_value_without_units(self):
        """Test parsing values without units (assumes preferred unit)."""
        manager = UnitSystemManager("metric")
        
        # Test parsing without units (assumes mm for length)
        value = manager.parse_value("1000", "length")
        assert value == 1.0
        
        # Test parsing without units (assumes kN for force)
        value = manager.parse_value("1", "force")
        assert value == 1000.0
    
    def test_parse_value_invalid_format(self):
        """Test parsing invalid value formats."""
        manager = UnitSystemManager("metric")
        
        with pytest.raises(ValueError):
            manager.parse_value("invalid", "length")
        
        with pytest.raises(ValueError):
            manager.parse_value("abc mm", "length")


class TestGlobalUnitFunctions:
    """Test the global unit functions."""
    
    def setup_method(self):
        """Reset unit system before each test."""
        set_unit_system("metric")
    
    def test_set_and_get_unit_system(self):
        """Test setting and getting the global unit system."""
        assert get_unit_system() == "metric"
        
        set_unit_system("imperial")
        assert get_unit_system() == "imperial"
        
        set_unit_system("metric")
        assert get_unit_system() == "metric"
    
    def test_get_unit_manager(self):
        """Test getting the global unit manager."""
        manager = get_unit_manager()
        assert isinstance(manager, UnitSystemManager)
        assert manager.system == "metric"
    
    def test_format_length_metric(self):
        """Test length formatting in metric system."""
        set_unit_system("metric")
        formatted = format_length(1.0)  # 1 m
        assert formatted == "1000.000 mm"
    
    def test_format_length_imperial(self):
        """Test length formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_length(1.0)  # 1 m
        assert formatted == "39.37 in"
    
    def test_format_force_metric(self):
        """Test force formatting in metric system."""
        set_unit_system("metric")
        formatted = format_force(1000.0)  # 1000 N
        assert formatted == "1.000 kN"
    
    def test_format_force_imperial(self):
        """Test force formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_force(4448.22)  # 4448.22 N
        assert formatted == "1.000 kip"
    
    def test_format_moment_metric(self):
        """Test moment formatting in metric system."""
        set_unit_system("metric")
        formatted = format_moment(1000.0)  # 1000 N·m
        assert formatted == "1.000 kN·m"
    
    def test_format_moment_imperial(self):
        """Test moment formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_moment(1355.82)  # 1355.82 N·m
        assert formatted == "1.000 kip·ft"
    
    def test_format_stress_metric(self):
        """Test stress formatting in metric system."""
        set_unit_system("metric")
        formatted = format_stress(1e9)  # 1 GPa
        assert formatted == "1.000 GPa"
    
    def test_format_stress_imperial(self):
        """Test stress formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_stress(6894760.0)  # 6894760 Pa
        assert formatted == "1.000 ksi"
    
    def test_format_area_metric(self):
        """Test area formatting in metric system."""
        set_unit_system("metric")
        formatted = format_area(1e-6)  # 1 mm²
        assert formatted == "1.000 mm²"
    
    def test_format_area_imperial(self):
        """Test area formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_area(6.4516e-4)  # 1 in²
        assert formatted == "1.0000 in²"
    
    def test_format_moment_of_inertia_metric(self):
        """Test moment of inertia formatting in metric system."""
        set_unit_system("metric")
        formatted = format_moment_of_inertia(1e-12)  # 1 mm⁴
        assert formatted == "1.000 mm⁴"
    
    def test_format_moment_of_inertia_imperial(self):
        """Test moment of inertia formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_moment_of_inertia(4.1623e-7)  # 1 in⁴
        assert formatted == "1.000000 in⁴"
    
    def test_format_acceleration_metric(self):
        """Test acceleration formatting in metric system."""
        set_unit_system("metric")
        formatted = format_acceleration(9.81)  # 9.81 m/s²
        assert formatted == "9.81 m/s²"
    
    def test_format_acceleration_imperial(self):
        """Test acceleration formatting in imperial system."""
        set_unit_system("imperial")
        formatted = format_acceleration(9.81)  # 9.81 m/s² (standard gravity)
        assert formatted == "32.19 ft/s²"
    
    def test_parse_length_metric(self):
        """Test length parsing in metric system."""
        set_unit_system("metric")
        value = parse_length("1000 mm")
        assert value == 1.0
        
        value = parse_length("1000")  # assumes mm
        assert value == 1.0
    
    def test_parse_length_imperial(self):
        """Test length parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_length("39.3701 in")
        assert value == pytest.approx(1.0, rel=1e-4)
        
        value = parse_length("39.3701")  # assumes in
        assert value == pytest.approx(1.0, rel=1e-4)
    
    def test_parse_force_metric(self):
        """Test force parsing in metric system."""
        set_unit_system("metric")
        value = parse_force("1 kN")
        assert value == 1000.0
        
        value = parse_force("1")  # assumes kN
        assert value == 1000.0
    
    def test_parse_force_imperial(self):
        """Test force parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_force("1 kip")
        assert value == pytest.approx(4448.22, rel=1e-4)
        
        value = parse_force("1")  # assumes kip
        assert value == pytest.approx(4448.22, rel=1e-4)
    
    def test_parse_moment_metric(self):
        """Test moment parsing in metric system."""
        set_unit_system("metric")
        value = parse_moment("1 kN·m")
        assert value == 1000.0
        
        value = parse_moment("1")  # assumes kN·m
        assert value == 1000.0
    
    def test_parse_moment_imperial(self):
        """Test moment parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_moment("1 kip·ft")
        assert value == pytest.approx(1355.82, rel=1e-4)
        
        value = parse_moment("1")  # assumes kip·ft
        assert value == pytest.approx(1355.82, rel=1e-4)
    
    def test_parse_stress_metric(self):
        """Test stress parsing in metric system."""
        set_unit_system("metric")
        value = parse_stress("1 GPa")
        assert value == 1e9
        
        value = parse_stress("1")  # assumes GPa
        assert value == 1e9
    
    def test_parse_stress_imperial(self):
        """Test stress parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_stress("1 ksi")
        assert value == pytest.approx(6894760.0, rel=1e-4)
        
        value = parse_stress("1")  # assumes ksi
        assert value == pytest.approx(6894760.0, rel=1e-4)
    
    def test_parse_area_metric(self):
        """Test area parsing in metric system."""
        set_unit_system("metric")
        value = parse_area("1 mm²")
        assert value == 1e-6
        
        value = parse_area("1")  # assumes mm²
        assert value == 1e-6
    
    def test_parse_area_imperial(self):
        """Test area parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_area("1 in²")
        assert value == pytest.approx(6.4516e-4, rel=1e-4)
        
        value = parse_area("1")  # assumes in²
        assert value == pytest.approx(6.4516e-4, rel=1e-4)
    
    def test_parse_moment_of_inertia_metric(self):
        """Test moment of inertia parsing in metric system."""
        set_unit_system("metric")
        value = parse_moment_of_inertia("1 mm⁴")
        assert value == 1e-12
        
        value = parse_moment_of_inertia("1")  # assumes mm⁴
        assert value == 1e-12
    
    def test_parse_moment_of_inertia_imperial(self):
        """Test moment of inertia parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_moment_of_inertia("1 in⁴")
        assert value == pytest.approx(4.1623e-7, rel=1e-4)
        
        value = parse_moment_of_inertia("1")  # assumes in⁴
        assert value == pytest.approx(4.1623e-7, rel=1e-4)
    
    def test_parse_acceleration_metric(self):
        """Test acceleration parsing in metric system."""
        set_unit_system("metric")
        value = parse_acceleration("9.81 m/s²")
        assert value == 9.81
        
        value = parse_acceleration("9.81")  # assumes m/s²
        assert value == 9.81
    
    def test_parse_acceleration_imperial(self):
        """Test acceleration parsing in imperial system."""
        set_unit_system("imperial")
        value = parse_acceleration("32.174 ft/s²")
        assert value == pytest.approx(9.81, rel=1e-3)  # 32.174 ft/s² = 9.81 m/s²
        
        value = parse_acceleration("32.174")  # assumes ft/s²
        assert value == pytest.approx(9.81, rel=1e-3)  # 32.174 ft/s² = 9.81 m/s²


class TestUnitConstants:
    """Test the Units class constants."""
    
    def test_length_units(self):
        """Test length unit constants."""
        assert Units.METER == "m"
        assert Units.MILLIMETER == "mm"
        assert Units.CENTIMETER == "cm"
        assert Units.FOOT == "ft"
        assert Units.INCH == "in"
    
    def test_force_units(self):
        """Test force unit constants."""
        assert Units.NEWTON == "N"
        assert Units.KILONEWTON == "kN"
        assert Units.POUND == "lb"
        assert Units.KIP == "kip"
    
    def test_moment_units(self):
        """Test moment unit constants."""
        assert Units.NEWTON_METER == "N·m"
        assert Units.KILONEWTON_METER == "kN·m"
        assert Units.POUND_FOOT == "lb·ft"
        assert Units.KIP_FOOT == "kip·ft"
    
    def test_stress_units(self):
        """Test stress unit constants."""
        assert Units.PASCAL == "Pa"
        assert Units.MEGAPASCAL == "MPa"
        assert Units.GIGAPASCAL == "GPa"
        assert Units.PSI == "psi"
        assert Units.KSI == "ksi"
    
    def test_area_units(self):
        """Test area unit constants."""
        assert Units.SQUARE_METER == "m²"
        assert Units.SQUARE_MILLIMETER == "mm²"
        assert Units.SQUARE_INCH == "in²"
    
    def test_moment_of_inertia_units(self):
        """Test moment of inertia unit constants."""
        assert Units.METER_TO_FOURTH == "m⁴"
        assert Units.MILLIMETER_TO_FOURTH == "mm⁴"
        assert Units.INCH_TO_FOURTH == "in⁴"
    
    def test_acceleration_units(self):
        """Test acceleration unit constants."""
        assert Units.METER_PER_SECOND_SQUARED == "m/s²"
        assert Units.FOOT_PER_SECOND_SQUARED == "ft/s²"


class TestUnitConversion:
    """Test the UnitConversion dataclass."""
    
    def test_unit_conversion_creation(self):
        """Test creating a UnitConversion instance."""
        conv = UnitConversion(factor=1.0, symbol="m", precision=3)
        assert conv.factor == 1.0
        assert conv.symbol == "m"
        assert conv.precision == 3
    
    def test_unit_conversion_default_precision(self):
        """Test UnitConversion with default precision."""
        conv = UnitConversion(factor=1.0, symbol="m")
        assert conv.precision == 3 